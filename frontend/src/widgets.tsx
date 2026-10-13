import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  categories,
  fieldLabels,
  numericFields,
  visibleFields,
  type Asset,
  type Box,
  type Item,
  type Category,
  type Field,
  type Composition,
} from "./types";

export function Modal({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      id="modal"
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-header">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <button className="modal-close" onClick={onClose} aria-label="닫기">
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Pill({ status, label }: { status: string; label?: string }) {
  return (
    <span className={"status-pill " + status}>
      {status === "pass" ? "✓" : status === "fail" ? "×" : "!"}{" "}
      {label ||
        { pass: "충족", unknown: "확인 필요", fail: "미충족" }[status] ||
        status}
    </span>
  );
}
export function ItemForm({
  item,
  isNew,
  onSave,
  onClose,
}: {
  item: Item;
  isNew: boolean;
  onSave: (it: Item, reason: string) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Item>({ ...item });
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const changed =
    isNew || visibleFields[item.category].some((f) => values[f] !== item[f]);
  const submit = () => {
    if (changed && !reason.trim()) {
      setError("수정 사유를 남겨주세요.");
      return;
    }
    if (isNew && !values.evidence.trim()) {
      setError("원문 또는 외부 확인 근거가 필요합니다.");
      return;
    }
    for (const f of visibleFields[item.category]) {
      const v = values[f];
      if (
        numericFields.has(f) &&
        v != null &&
        (!Number.isFinite(Number(v)) || Number(v) < 0)
      ) {
        setError("숫자 필드를 확인하세요.");
        return;
      }
      if (
        ["quantity", "cores", "ports", "cal_count", "license_cores"].includes(
          f,
        ) &&
        v != null &&
        Number(v) % 1 !== 0
      ) {
        setError("수량·코어·포트 수는 정수로 입력하세요.");
        return;
      }
    }
    onSave(
      {
        ...values,
        manual: changed || item.manual,
        confidence: values.reviewed ? "explicit" : values.confidence,
      },
      reason,
    );
  };
  return (
    <>
      <div className="modal-body">
        <h3>원문 근거</h3>
        {isNew ? (
          <textarea
            id="new-evidence"
            value={values.evidence}
            onChange={(e) => setValues({ ...values, evidence: e.target.value })}
          />
        ) : (
          <div className="evidence">{item.evidence}</div>
        )}
        {item.issues.length > 0 && (
          <div className="notice warn">{item.issues.join(" ")}</div>
        )}
        <div className="form-grid">
          {visibleFields[item.category].map((f) => (
            <div key={f} className={f === "model" ? "full-field" : ""}>
              <label htmlFor={"field-" + f}>{fieldLabels[f]}</label>
              {f === "mount" ? (
                <select
                  id={"field-" + f}
                  value={String(values[f] || "")}
                  onChange={(e) =>
                    setValues({ ...values, [f]: e.target.value || null })
                  }
                >
                  <option value="">미명시</option>
                  {["PCIe", "OCP", "LOM"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              ) : (
                <input
                  id={"field-" + f}
                  value={values[f] ?? ""}
                  type={numericFields.has(f) ? "number" : "text"}
                  min={0}
                  step="any"
                  placeholder="미명시"
                  onChange={(e) =>
                    setValues({
                      ...values,
                      [f]:
                        e.target.value === ""
                          ? null
                          : numericFields.has(f)
                            ? Number(e.target.value)
                            : e.target.value,
                    })
                  }
                />
              )}
            </div>
          ))}
          <div className="full-field">
            <label htmlFor="edit-reason">수정 사유 (값 변경 시 필수)</label>
            <input
              id="edit-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <label className="review-checkbox" style={{ marginTop: 20 }}>
          <input
            id="reviewed-check"
            type="checkbox"
            checked={!!values.reviewed}
            onChange={(e) =>
              setValues({ ...values, reviewed: e.target.checked })
            }
          />{" "}
          원문과 대조하여 이 항목을 검토했습니다.
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="modal-footer">
        <p>빈칸은 미명시입니다. 저장하면 비교를 다시 계산합니다.</p>
        <div className="buttons">
          <button className="button" onClick={onClose}>
            취소
          </button>
          <button className="button primary" id="save-item" onClick={submit}>
            {isNew ? "추가" : "검토 저장"}
          </button>
        </div>
      </div>
    </>
  );
}
export interface LibraryContext {
  purpose: "browse" | "base" | "part" | "filler";
  partIndex?: number;
}
export function Library({
  assets,
  context,
  part,
  composition,
  onSelect,
  onStencil,
  onImage,
}: {
  assets: Asset[];
  context: LibraryContext;
  part?: Item;
  composition: Composition;
  onSelect: (a: Asset) => void;
  onStencil: () => void;
  onImage: () => void;
}) {
  const expected =
    context.purpose === "base"
      ? "server"
      : context.purpose === "filler"
        ? "filler"
        : part
          ? ["nic", "hba"].includes(part.category)
            ? "card"
            : part.category === "psu"
              ? "psu"
              : ["ssd", "hdd"].includes(part.category)
                ? "disk"
                : "other"
          : null;
  const [filter, setFilter] = useState(expected || "all");
  const [search, setSearch] = useState("");
  const rows = assets.filter(
    (a) =>
      (filter === "all" || a.category === filter) &&
      (a.name + " " + (a.aliases || []).join(" "))
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="modal-body">
      <div className="dialog-toolbar">
        <span className="muted">{assets.length}개 실제 이미지</span>
        <div className="buttons">
          <button
            className="button small"
            id="library-stencil"
            onClick={onStencil}
          >
            스텐실 가져오기
          </button>
          <button
            className="button small"
            id="library-upload"
            onClick={onImage}
          >
            이미지 추가
          </button>
        </div>
      </div>
      <input
        id="asset-search"
        className="library-search"
        placeholder="R760, X710, QLE2772 등 이름·모델 검색"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="library-filters">
        {[
          ["all", "전체"],
          ["server", "서버"],
          ["disk", "디스크"],
          ["psu", "PSU"],
          ["filler", "필러"],
          ["card", "NIC·HBA"],
          ["other", "기타"],
        ].map(([v, label]) => (
          <button
            key={v}
            className={"filter-button " + (filter === v ? "active" : "")}
            onClick={() => setFilter(v)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="library-grid-container">
        <div className="library-grid">
          {rows.map((a) => {
            const wrongCategory = !!expected && a.category !== expected;
            const wrongBase =
              context.purpose === "base" &&
              (a.view !== composition.view ||
                (!composition.practice && a.model !== composition.model));
            const wrongMount =
              !!part?.mount && !!a.mount && part.mount !== a.mount;
            return (
              <button
                key={a.id}
                className={
                  "asset-card " +
                  (wrongCategory || wrongBase || wrongMount ? "disabled" : "")
                }
                disabled={wrongCategory || wrongBase || wrongMount}
                data-asset={a.id}
                onClick={() => onSelect(a)}
              >
                <img src={a.url} alt={a.name} loading="lazy" />
                <h3>{a.name}</h3>
                <p>
                  {a.source} · {a.model || a.mount || "형식 확인 필요"}
                </p>
                {wrongBase && <p>대상 모델/방향과 다릅니다.</p>}
                {wrongMount && <p>장착 형식이 다릅니다.</p>}
              </button>
            );
          })}
          {!rows.length && (
            <div className="empty-state" style={{ gridColumn: "1/-1" }}>
              <h3>이 부품에 맞는 이미지가 없습니다.</h3>
              <p>실제 이미지를 추가하거나 글자 라벨로 배치합니다.</p>
            </div>
          )}
        </div>
      </div>
      <p className="field-caption">
        실제 내장 이미지는 전체 Visio 마스터의 XML 도형·텍스트·회전과 다를 수
        있습니다.
      </p>
    </div>
  );
}
export function BoxForm({
  view,
  count,
  onSave,
  onClose,
}: {
  view: string;
  count: number;
  onSave: (kind: string, name: string, size: number | null) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState(view === "front" ? "Bay" : "PCIe");
  const [name, setName] = useState(
    (view === "front" ? "베이" : "영역") + " " + (count + 1),
  );
  const [size, setSize] = useState("");
  return (
    <>
      <div className="modal-body">
        <div className="form-grid">
          <div>
            <label>영역 종류</label>
            <select
              id="new-box-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              {(view === "front"
                ? ["Bay", "Internal"]
                : ["PCIe", "OCP", "LOM", "PSU", "Internal"]
              ).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label>영역 이름</label>
            <input
              id="new-box-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label>베이 인치</label>
            <input
              id="new-box-size"
              type="number"
              step="0.1"
              value={size}
              onChange={(e) => setSize(e.target.value)}
            />
          </div>
        </div>
        <p className="field-caption">
          영역 생성 후 실제 위치로 보정하고 좌표를 확정하세요.
        </p>
      </div>
      <div className="modal-footer">
        <button className="button" onClick={onClose}>
          취소
        </button>
        <button
          className="button primary"
          id="create-box"
          disabled={
            !name.trim() ||
            (!!size && (!Number.isFinite(Number(size)) || Number(size) <= 0))
          }
          onClick={() => onSave(kind, name, size ? Number(size) : null)}
        >
          추가하고 보정
        </button>
      </div>
    </>
  );
}
export function ImageForm({
  file,
  preview,
  defaultCategory,
  defaultMount,
  onSave,
  onClose,
}: {
  file: File;
  preview: string;
  defaultCategory: string;
  defaultMount: string;
  onSave: (metadata: {
    name: string;
    category: string;
    model: string;
    view: string;
    mount: string;
  }) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(file.name.replace(/\.[^.]+$/, ""));
  const [category, setCategory] = useState(defaultCategory);
  const [model, setModel] = useState("");
  const [view, setView] = useState("front");
  const [mount, setMount] = useState(defaultMount);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <div className="modal-body">
        <img
          src={preview}
          alt="실제 이미지 미리보기"
          style={{ width: "100%", height: 130, objectFit: "contain" }}
        />
        <div className="form-grid">
          <div className="full-field">
            <label>이름 · 모델 토큰 포함</label>
            <input
              id="asset-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label>분류</label>
            <select
              id="asset-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {["server", "disk", "psu", "filler", "card", "other"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label>서버 모델</label>
            <input
              id="asset-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </div>
          <div>
            <label>방향</label>
            <select
              id="asset-view"
              value={view}
              onChange={(e) => setView(e.target.value)}
            >
              <option value="front">전면</option>
              <option value="rear">후면</option>
              <option value="">해당 없음</option>
            </select>
          </div>
          <div>
            <label>카드 장착 형식</label>
            <select
              id="asset-mount"
              value={mount}
              onChange={(e) => setMount(e.target.value)}
            >
              <option value="">미확인/해당 없음</option>
              <option>PCIe</option>
              <option>OCP</option>
              <option>LOM</option>
            </select>
          </div>
        </div>
        <label className="review-checkbox" style={{ marginTop: 20 }}>
          <input
            id="real-image-check"
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          실제 이미지와 모델·형식을 확인했습니다.
        </label>
      </div>
      <div className="modal-footer">
        <button className="button" onClick={onClose}>
          취소
        </button>
        <button
          className="button primary"
          id="asset-save"
          disabled={
            busy ||
            !confirmed ||
            !name.trim() ||
            (category === "server" && !model.trim())
          }
          onClick={async () => {
            setBusy(true);
            try {
              await onSave({
                name,
                category,
                model: model.toUpperCase(),
                view: category === "server" ? view : "",
                mount,
              });
            } finally {
              setBusy(false);
            }
          }}
        >
          이미지 저장
        </button>
      </div>
    </>
  );
}
export function Canvas({
  asset,
  assets,
  composition,
  selected,
  onSelect,
  onMove,
}: {
  asset: Asset;
  assets: Asset[];
  composition: Composition;
  selected: string[];
  onSelect: (id: string | null, multi?: boolean) => void;
  onMove: (ids: string[], dx: number, dy: number, label: boolean) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef<{
    ids: string[];
    x: number;
    y: number;
    label: boolean;
  } | null>(null);
  const [offset, setOffset] = useState({ dx: 0, dy: 0 });
  const boxes = composition.boxes[composition.view];
  const point = (e: ReactPointerEvent<SVGSVGElement>) => {
    const p = ref.current!.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    return p.matrixTransform(ref.current!.getScreenCTM()!.inverse());
  };
  return (
    <svg
      id="server-canvas"
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1000 400"
      role="img"
      aria-label={asset.name}
      onPointerDown={(e) => {
        const target = e.target as Element;
        const box = target.closest("[data-box]");
        if (!box) {
          onSelect(null);
          return;
        }
        const id = box.getAttribute("data-box")!;
        onSelect(id, e.shiftKey);
        const p = point(e);
        drag.current = {
          ids: target.closest("[data-label]")
            ? [id]
            : selected.includes(id)
              ? selected
              : [id],
          x: p.x,
          y: p.y,
          label: !!target.closest("[data-label]"),
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const p = point(e),
          snap = composition.snap ? 5 : 1;
        setOffset({
          dx: Math.round((p.x - drag.current.x) / snap) * snap,
          dy: Math.round((p.y - drag.current.y) / snap) * snap,
        });
      }}
      onPointerUp={(e) => {
        if (!drag.current) return;
        onMove(drag.current.ids, offset.dx, offset.dy, drag.current.label);
        drag.current = null;
        setOffset({ dx: 0, dy: 0 });
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setOffset({ dx: 0, dy: 0 });
      }}
    >
      <defs>
        <pattern
          id="guidegrid"
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <path d="M20 0H0V20" fill="none" stroke="#dce7f4" strokeWidth=".5" />
        </pattern>
      </defs>
      <rect width="1000" height="400" fill="#fafbfd" />
      <image
        href={asset.url}
        x="20"
        y="100"
        width="960"
        height="200"
        preserveAspectRatio="xMidYMid meet"
      />
      {composition.guides && (
        <rect
          width="1000"
          height="400"
          fill="url(#guidegrid)"
          pointerEvents="none"
        />
      )}
      {boxes.map((b) => {
        const labelDrag =
          drag.current?.label && drag.current.ids.includes(b.id);
        const rectDrag =
          !drag.current?.label && drag.current?.ids.includes(b.id);
        const lx = (b.lx ?? b.x + b.w / 2) + (labelDrag ? offset.dx : 0);
        const ly = (b.ly ?? b.y - 18) + (labelDrag ? offset.dy : 0);
        const image = assets.find((a) => a.id === b.assetId);
        return (
          <g
            key={b.id}
            data-box={b.id}
            className="pointer"
            transform={
              rectDrag ? `translate(${offset.dx} ${offset.dy})` : undefined
            }
          >
            <rect
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              className={
                selected.includes(b.id)
                  ? "calibration-selected"
                  : "calibration-box"
              }
            />
            {image ? (
              <image
                href={image.url}
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                preserveAspectRatio="xMidYMid meet"
              />
            ) : b.kind === "PSU" && b.part == null ? (
              <text
                x={b.x + b.w / 2}
                y={b.y + b.h / 2}
                textAnchor="middle"
                fontSize="10"
                fill="#7e8ca1"
              >
                EMPTY
              </text>
            ) : null}
            {b.connector !== false && (
              <line
                x1={b.x + b.w / 2}
                y1={b.y}
                x2={lx}
                y2={ly}
                stroke="#6a86ad"
              />
            )}
            <g data-label={b.id}>
              <rect
                x={lx - 65}
                y={ly - 16}
                width="130"
                height="22"
                rx="4"
                className="canvas-label"
              />
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                fontSize="9"
                fill="#3b5578"
                fontWeight={b.bold ? "700" : "400"}
              >
                {(b.label || b.name).slice(0, 30)}
              </text>
            </g>
          </g>
        );
      })}
      <text x="20" y="375" fontSize="10" fill="#91a0b3">
        {composition.practice
          ? "XR 편집 연습 · 견적 서버와 별개"
          : "구성 배치안 · 호환성 미확정"}{" "}
        · 실제 Dell 스텐실
      </text>
    </svg>
  );
}
