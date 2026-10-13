import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, download, saveAsset } from "./api";
import {
  categories,
  fieldLabels,
  fresh,
  summary,
  quantities,
  visibleFields,
  type Draft,
  type Analysis,
  type Asset,
  type Box,
  type Item,
  type Category,
  type Field,
  type Row,
  type Research,
  type Verdict,
} from "./types";
import {
  Modal,
  Pill,
  ItemForm,
  Library,
  BoxForm,
  ImageForm,
  Canvas,
  type LibraryContext,
} from "./widgets";
import { example } from "./example";

const steps = ["문서 입력", "추출값 검토", "판정 확인", "서버 이미지 구성"];
type Dialog = { title: string; subtitle?: string; body: ReactNode };
const deep = <T,>(value: T): T => structuredClone(value);
function initial() {
  try {
    const raw = JSON.parse(localStorage.getItem("sv-draft-v2") || "null");
    if (
      raw?.version === 2 &&
      raw.composition?.boxes &&
      typeof raw.requirement === "string"
    )
      return raw as Draft;
  } catch {}
  return fresh();
}
function Button({
  children,
  onClick,
  id,
  disabled = false,
  primary = false,
  small = false,
}: {
  children: ReactNode;
  onClick: () => void;
  id?: string;
  disabled?: boolean;
  primary?: boolean;
  small?: boolean;
}) {
  return (
    <button
      id={id}
      className={
        "button " + (primary ? "primary " : "") + (small ? "small" : "")
      }
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function Footer({ note, children }: { note: ReactNode; children: ReactNode }) {
  return (
    <div className="actionbar">
      <div>{note}</div>
      <div className="buttons">{children}</div>
    </div>
  );
}
function Heading({
  step,
  title,
  description,
  children,
}: {
  step: number;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">STEP 0{step + 1} · SERVER VALIDATOR</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
function Metric({
  caption,
  value,
  sub,
  warn = false,
}: {
  caption: string;
  value: ReactNode;
  sub: string;
  warn?: boolean;
}) {
  return (
    <div className={"metric " + (warn ? "warn" : "")}>
      <div className="caption">{caption}</div>
      <div className="value">{value}</div>
      <p>{sub}</p>
    </div>
  );
}
function blankItem(category: Category): Item {
  return {
    category,
    evidence: "",
    confidence: "ambiguous",
    issues: [],
    ...(Object.fromEntries(
      Object.keys(fieldLabels).map((f) => [f, null]),
    ) as Record<Field, null>),
  };
}
function invalidate(next: Draft, index?: number) {
  if (index == null) next.composition.mappings = {};
  else delete next.composition.mappings[index];
  for (const view of ["front", "rear"] as const)
    for (const box of next.composition.boxes[view])
      if (box.part != null && (index == null || box.part === index)) {
        box.part = null;
        box.assetId = null;
        box.label = box.name;
      }
}
function addLog(next: Draft, action: string, detail: string) {
  next.history.push({ at: new Date().toISOString(), action, detail });
}
async function signature(draft: Draft) {
  const raw = JSON.stringify(
    draft.data?.quote.items.map((i) => ({
      category: i.category,
      ...Object.fromEntries(
        Object.keys(fieldLabels).map((f) => [f, i[f as Field]]),
      ),
    })) || [],
  );
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function App() {
  const [draft, setDraft] = useState<Draft>(initial);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [configured, setConfigured] = useState(false);
  const [engine, setEngine] = useState("auto");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [documentsOpen, setDocumentsOpen] = useState(!draft.data);
  const [editorMode, setEditorMode] = useState<"configuration" | "labels" | "coordinates">("configuration");
  const [zoom, setZoom] = useState(100);
  const [library, setLibrary] = useState<LibraryContext | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [tab, setTab] = useState("requirements");
  const [filter, setFilter] = useState("all");
  const stencilRef = useRef<HTMLInputElement>(null),
    imageRef = useRef<HTMLInputElement>(null),
    calibrationRef = useRef<HTMLInputElement>(null);
  const compareVersion = useRef(0);
  const notify = (text: string) => setMessage(text);
  const update = (fn: (next: Draft) => void) =>
    setDraft((prev) => {
      const next = deep(prev);
      fn(next);
      return next;
    });
  const close = () => {
    setDialog(null);
    setLibrary(null);
  };
  const show = (title: string, body: ReactNode, subtitle?: string) => {
    setLibrary(null);
    setDialog({ title, body, subtitle });
  };
  const confirm = (
    title: string,
    description: string,
    action: () => void,
    label = "확인",
  ) =>
    show(
      title,
      <>
        <div className="modal-body">
          <p className="instruction">{description}</p>
        </div>
        <div className="modal-footer">
          <Button onClick={close}>취소</Button>
          <Button
            id="confirm-action"
            primary
            onClick={() => {
              close();
              action();
            }}
          >
            {label}
          </Button>
        </div>
      </>,
    );
  const save = () => {
    try {
      localStorage.setItem("sv-draft-v2", JSON.stringify(draft));
      notify("이 브라우저에 임시 저장했습니다.");
    } catch {
      notify("저장 공간이 부족합니다. 내보내기를 사용하세요.");
    }
  };
  const go = (step: number) => {
    update((n) => (n.step = step));
    if (step === 3) { setEditorOpen(true); return; }
    setEditorOpen(false);
    if (step === 0) setDocumentsOpen(true);
    document.getElementById(["documents-panel", "specifications-panel", "verdict-panel"][step])?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  const c = draft.composition,
    boxes = c.boxes[c.view],
    image = assets.find((a) => a.id === c.images[c.view]),
    selectedBox = boxes.find((b) => selected.includes(b.id));
  const reviewItems = draft.data
    ? [...draft.data.requirement.items, ...draft.data.quote.items]
    : [];
  const reviewed = reviewItems.filter((i) => i.reviewed).length;
  const quoteModel = draft.data?.quote.items.find(
    (i) => i.category === "server",
  )?.model;
  const modelName = String(
    quoteModel ||
      draft.data?.requirement.items.find((i) => i.category === "server")
        ?.model ||
      "모델 미확인",
  );
  const loadCatalog = async () => {
    const res = await fetch("/api/catalog");
    if (!res.ok) throw Error("이미지 보관함을 불러오지 못했습니다.");
    const data = await res.json();
    setAssets(data.assets);
  };
  useEffect(() => {
    void loadCatalog().catch((e) => notify(String(e)));
    void fetch("/api/health")
      .then((r) => r.json())
      .then((h) => setConfigured(!!h.ai_connected));
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem("sv-draft-v2", JSON.stringify(draft));
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [draft]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 3200);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    if (draft.data?.comparison.rows.some((row) => row.category === undefined)) {
      void calculate(deep(draft));
    }
  }, []);
  const moveBoxes = (ids: string[], dx: number, dy: number, label: boolean) =>
    update((n) => {
      for (const b of n.composition.boxes[n.composition.view].filter((b) =>
        ids.includes(b.id),
      )) {
        if (label) {
          b.lx = Math.max(65, Math.min(935, (b.lx ?? b.x + b.w / 2) + dx));
          b.ly = Math.max(20, Math.min(370, (b.ly ?? b.y - 18) + dy));
        } else {
          b.x = Math.max(0, Math.min(1000 - b.w, b.x + dx));
          b.y = Math.max(0, Math.min(400 - b.h, b.y + dy));
        }
      }
      if (!label && (dx || dy))
        n.composition.confirmed[n.composition.view] = false;
    });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        !editorOpen || editorMode === "configuration" ||
        dialog ||
        library ||
        !selected.length ||
        /INPUT|TEXTAREA|SELECT/.test((e.target as Element).tagName)
      )
        return;
      const amount = e.shiftKey ? 10 : 1;
      const delta: Record<string, [number, number]> = {
        ArrowLeft: [-amount, 0],
        ArrowRight: [amount, 0],
        ArrowUp: [0, -amount],
        ArrowDown: [0, amount],
      };
      if (delta[e.key]) {
        e.preventDefault();
        moveBoxes(selected, ...delta[e.key], editorMode === "labels");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editorOpen, editorMode, dialog, library, selected]);
  async function calculate(next: Draft) {
    if (!next.data) return;
    const version = ++compareVersion.current;
    const slots = (["front", "rear"] as const).flatMap((view) =>
      next.composition.boxes[view]
        .filter((b) => b.part != null)
        .map((b) => ({
          slot: view + ":" + b.id,
          slot_mount: ["PCIe", "OCP", "LOM"].includes(b.kind) ? b.kind : null,
          component_mount: next.data!.quote.items[b.part!]?.mount || null,
        })),
    );
    setDraft(next);
    try {
      const result = await api<{ comparison: Verdict; compatibility: Verdict }>(
        "/api/compare",
        {
          requirement: next.data.requirement,
          quote: next.data.quote,
          policy: next.policy,
          placement: { slots },
        },
      );
      if (version === compareVersion.current)
        setDraft((current) => current.data ? { ...current, data: { ...current.data, ...result } } : current);
    } catch (e) {
      notify(String(e));
    }
  }
  async function analyze() {
    if (!draft.requirement.trim() || !draft.quote.trim()) {
      notify("요구사항과 견적을 모두 입력하세요.");
      return;
    }
    setBusy(true);
    const version = ++compareVersion.current;
    try {
      const result = await api<Analysis>("/api/analyze", {
        requirement: draft.requirement,
        quote: draft.quote,
        policy: draft.policy,
        engine,
      });
      if (version !== compareVersion.current) return;
      setDraft((current) => {
        const next = deep(current);
        next.data = result;
        next.step = 1;
        invalidate(next);
        addLog(next, "두 문서 분석", result.requirement.method + " / " + result.quote.method);
        return next;
      });
      setDocumentsOpen(false);
      document.getElementById("specifications-panel")?.scrollTo(0, 0);
    } catch (e) {
      notify(String(e));
    } finally {
      setBusy(false);
    }
  }
  function openLibrary(context: LibraryContext = { purpose: "browse" }) {
    setDialog(null);
    setLibrary(context);
  }
  function editItem(
    key: "requirement" | "quote",
    index: number | null,
    category: Category = "server",
  ) {
    const it =
      index == null ? blankItem(category) : draft.data![key].items[index];
    show(
      categories[it.category] + " 원문·추출값 검토",
      <ItemForm
        item={it}
        isNew={index == null}
        onClose={close}
        onSave={(item, reason) => {
          const next = deep(draft);
          if (index == null) next.data![key].items.push(item);
          else {
            const changed = visibleFields[it.category].some(
              (f) => item[f] !== it[f],
            );
            next.data![key].items[index] = item;
            if (changed && key === "quote") invalidate(next, index);
          }
          addLog(
            next,
            item.manual ? "추출값 수정" : "원문 검토",
            `${key === "quote" ? "견적" : "요구"} ${categories[it.category]} · ${reason || "원문 대조"}`,
          );
          close();
          void calculate(next);
          notify("저장하고 예비 판정을 다시 계산했습니다.");
        }}
      />,
      key === "quote" ? "견적 원문" : "고객 요구사항",
    );
  }
  function addItem() {
    show(
      "누락 항목 추가",
      <AddItem
        onClose={close}
        onNext={(key, category) => editItem(key, null, category)}
      />,
    );
  }
  function history() {
    show(
      "변경 이력",
      <>
        <div className="modal-body">
          {draft.history
            .slice()
            .reverse()
            .map((h, i) => (
              <div key={i} className="change-list">
                <time>
                  {new Date(h.at).toLocaleString("ko-KR", {
                    timeZone: "Asia/Seoul",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  KST
                </time>
                <div>
                  <strong>{h.action}</strong>
                  <p>{h.detail}</p>
                </div>
              </div>
            ))}
        </div>
        <div className="modal-footer">
          <Button onClick={close}>닫기</Button>
          <Button
            onClick={() =>
              download(
                "review-history.json",
                JSON.stringify(draft.history, null, 2),
              )
            }
          >
            이력 내보내기
          </Button>
        </div>
      </>,
    );
  }
  function inspect(row: Row) {
    show(
      row.title + " · 원문 근거",
      <>
        <div className="modal-body">
          {row.evidence.length ? (
            row.evidence.map((e, i) => (
              <div className="evidence" key={i}>
                {e}
              </div>
            ))
          ) : (
            <div className="notice warn">
              원문 근거가 부족합니다. 서버 모델·라이저·부품번호와 공식 문서를
              확인하세요.
            </div>
          )}
        </div>
        <div className="modal-footer">
          <Button onClick={close}>닫기</Button>
          <Button
            id="evidence-edit"
            primary
            onClick={() => {
              close();
              go(1);
            }}
          >
            추출값 검토로 이동
          </Button>
        </div>
      </>,
    );
  }
  function investigate(row: Row | Research, readOnly = false) {
    const question =
      "question" in row
        ? row.question
        : `${row.title}: ${row.expected}. 견적: ${row.actual}. ${row.reason} 공식 데이터시트에서 확인할 문장과 표는?`;
    show(
      "공식 자료 조사",
      <ResearchForm
        title={row.title}
        question={question}
        configured={configured}
        readOnly={readOnly}
        existing={"question" in row ? row : undefined}
        onClose={close}
        onSave={async (q) => {
          const result = await api<
            Pick<Research, "status" | "text" | "citations">
          >("/api/research", { question: q });
          update((n) => {
            n.research.push({ title: row.title, question: q, ...result });
            addLog(n, "공식 자료 조사", row.title + " · " + result.status);
          });
          close();
          notify(
            result.status === "pending"
              ? "조사 요청을 저장했습니다. 검색은 미실행 상태입니다."
              : "조사 초안을 저장했습니다. 출처를 직접 검토하세요.",
          );
        }}
      />,
    );
  }
  function selectAsset(a: Asset) {
    if (!library) return;
    const ctx = library;
    if (ctx.purpose === "browse") {
      show(
        a.name,
        <>
          <div className="modal-body">
            <img
              src={a.url}
              alt={a.name}
              style={{ width: "100%", maxHeight: 300, objectFit: "contain" }}
            />
            <div className="evidence">
              출처: {a.source}
              {"\n"}
              {a.embedded_path}
              {"\n"}
              {a.note}
            </div>
          </div>
          <div className="modal-footer">
            <Button onClick={() => openLibrary(ctx)}>← 보관함</Button>
            <Button onClick={close}>닫기</Button>
          </div>
        </>,
      );
      return;
    }
    if (ctx.purpose === "base") {
      if (
        a.category !== "server" ||
        a.view !== c.view ||
        (!c.practice && a.model !== c.model)
      ) {
        notify("같은 모델과 방향의 실제 서버 이미지가 필요합니다.");
        return;
      }
      const apply = () => {
        update((n) => {
          n.composition.images[c.view] = a.id;
          n.composition.boxes[c.view] = [];
          n.composition.confirmed[c.view] = false;
          addLog(n, "서버 이미지 선택", a.name);
        });
        setSelected([]);
        close();
      };
      if (boxes.length)
        confirm(
          "서버 이미지와 보정 영역을 바꿀까요?",
          "이 방향의 좌표와 배치를 초기화합니다.",
          apply,
          "이미지 변경",
        );
      else apply();
      return;
    }
    if (ctx.purpose === "filler") {
      if (a.category !== "filler") return;
      update((n) => {
        for (const b of n.composition.boxes[c.view])
          if (selected.includes(b.id) && b.kind === "Bay" && b.part == null) {
            b.assetId = a.id;
            b.label = "FILLER";
          }
      });
      close();
      return;
    }
    const index = ctx.partIndex!,
      part = draft.data!.quote.items[index];
    if (part.mount && a.mount && part.mount !== a.mount) {
      notify("PCIe/OCP/LOM 형식이 다릅니다.");
      return;
    }
    const link = () => {
      update((n) => {
        n.composition.mappings[index] = a.id;
        for (const v of ["front", "rear"] as const)
          for (const b of n.composition.boxes[v])
            if (b.part === index) b.assetId = a.id;
        addLog(
          n,
          "부품 이미지 연결",
          (part.model || categories[part.category]) + " → " + a.name,
        );
      });
      close();
    };
    if (part.mount && !a.mount)
      confirm(
        "이미지의 장착 형식을 확인하세요.",
        "형식이 미명시입니다. 실제 해당 부품 이미지임을 확인한 경우 연결하세요. 호환 판정은 보류합니다.",
        link,
        "직접 확인 후 연결",
      );
    else link();
  }
  async function importStencil(file: File) {
    const ctx = library || { purpose: "browse" as const };
    if (file.size > 128 * 1024 * 1024) {
      notify("스텐실은 128MB 이하만 가져올 수 있습니다.");
      return;
    }
    show(
      "스텐실 가져오는 중",
      <div className="modal-body">
        <p>{file.name}</p>
        <p className="instruction">
          실제 내장 이미지와 원본 이름을 추출·변환합니다. 큰 파일은 잠시
          걸립니다.
        </p>
      </div>,
    );
    try {
      const res = await fetch(
        "/api/stencil?name=" + encodeURIComponent(file.name),
        { method: "POST", body: file },
      );
      const result = await res.json();
      if (!res.ok) throw Error(result.error || result.detail);
      await loadCatalog();
      update((n) =>
        addLog(
          n,
          "스텐실 가져오기",
          `${file.name} · ${result.imported}개 추출 · ${result.unsupported}개 미지원`,
        ),
      );
      openLibrary(ctx);
      notify(`${result.imported}개 실제 이미지 가져오기 완료`);
    } catch (e) {
      show(
        "스텐실 가져오기 실패",
        <>
          <div className="modal-body">
            <div className="notice warn">{String(e)}</div>
            <p>
              XML 도형을 임의로 그리지 않습니다. Visio에서 실제 PNG로 내보내
              가져올 수 있습니다.
            </p>
          </div>
          <div className="modal-footer">
            <Button onClick={close}>닫기</Button>
            <Button
              id="retry-stencil"
              onClick={() => stencilRef.current?.click()}
            >
              다른 파일 선택
            </Button>
          </div>
        </>,
      );
    }
  }
  async function addImage(file: File) {
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 20 * 1024 * 1024
    ) {
      notify("PNG/JPG/WebP 20MB 이하만 추가할 수 있습니다.");
      return;
    }
    const ctx = library || { purpose: "browse" as const };
    const part =
      ctx.partIndex != null
        ? draft.data!.quote.items[ctx.partIndex]
        : undefined;
    const preview = URL.createObjectURL(file);
    show(
      "실제 이미지 정보 지정",
      <ImageForm
        file={file}
        preview={preview}
        defaultCategory={
          part
            ? ["nic", "hba"].includes(part.category)
              ? "card"
              : part.category === "psu"
                ? "psu"
                : ["ssd", "hdd"].includes(part.category)
                  ? "disk"
                  : "other"
            : "server"
        }
        defaultMount={String(part?.mount || "")}
        onClose={() => {
          URL.revokeObjectURL(preview);
          close();
        }}
        onSave={async (meta) => {
          try {
            const params = new URLSearchParams({
              ...meta,
              name: meta.name + (file.name.match(/\.[^.]+$/)?.[0] || ".png"),
            });
            const res = await fetch("/api/images?" + params, {
              method: "POST",
              body: file,
            });
            const a = await res.json();
            if (!res.ok) throw Error(a.error || a.detail);
            await saveAsset({ ...a, blob: file });
            setAssets((prev) => [...prev, a]);
            update((n) => addLog(n, "실제 이미지 추가", a.name));
            openLibrary(ctx);
            URL.revokeObjectURL(preview);
            notify("실제 이미지를 저장했습니다.");
          } catch (e) {
            notify(String(e));
          }
        }}
      />,
    );
  }
  function addBox() {
    show(
      c.view === "front" ? "베이 영역 추가" : "슬롯·PSU 영역 추가",
      <BoxForm
        view={c.view}
        count={boxes.length}
        onClose={close}
        onSave={(kind, name, sizeIn) => {
          const b: Box = {
            id: crypto.randomUUID(),
            kind,
            name,
            x: 100 + (boxes.length % 6) * 125,
            y: 150,
            w: 110,
            h: 80,
            label: name,
            part: null,
            assetId: null,
            sizeIn,
            connector: true,
          };
          update((n) => {
            n.composition.boxes[c.view].push(b);
            n.composition.confirmed[c.view] = false;
          });
          setSelected([b.id]);
          close();
        }}
      />,
    );
  }
  function place(index: number) {
    const it = draft.data!.quote.items[index];
    const kind = ["ssd", "hdd"].includes(it.category)
      ? "Bay"
      : it.category === "psu"
        ? "PSU"
        : ["cpu", "memory"].includes(it.category)
          ? "Internal"
          : it.mount;
    const options = boxes.filter((b) => b.kind === kind && b.part == null);
    const count = (["front", "rear"] as const)
      .flatMap((v) => c.boxes[v])
      .filter((b) => b.part === index).length;
    show(
      (it.model || categories[it.category]) + " 배치",
      <PlaceForm
        item={it}
        options={options}
        count={count}
        practice={c.practice}
        onClose={close}
        onSave={(id) => {
          const b = boxes.find((v) => v.id === id)!;
          if (it.size_in && b.sizeIn && Number(it.size_in) !== b.sizeIn) {
            notify("디스크와 베이 폼팩터가 다릅니다.");
            return;
          }
          const next = deep(draft),
            target = next.composition.boxes[c.view].find((v) => v.id === id)!;
          target.part = index;
          target.label =
            (it.model || categories[it.category]) +
            " · " +
            (it.capacity_gb
              ? it.capacity_gb + "GB"
              : it.watts
                ? it.watts + "W"
                : it.mount || "");
          target.assetId = c.mappings[index] || null;
          addLog(next, "부품 배치", target.label + " → " + b.name);
          close();
          void calculate(next);
        }}
      />,
    );
  }
  function coordinate(field: "x" | "y" | "w" | "h", value: number) {
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      value > 1000 ||
      (["w", "h"].includes(field) && value === 0)
    )
      return;
    update((n) => {
      for (const b of n.composition.boxes[c.view])
        if (selected.includes(b.id)) b[field] = value;
      n.composition.confirmed[c.view] = false;
    });
  }
  function confirmCoordinates() {
    if (
      boxes.some(
        (b) =>
          b.x < 0 ||
          b.y < 0 ||
          b.w <= 0 ||
          b.h <= 0 ||
          b.x + b.w > 1000 ||
          b.y + b.h > 400,
      )
    ) {
      notify("영역이 편집 좌표 범위 안에 있어야 합니다.");
      return;
    }
    update((n) => {
      n.composition.confirmed[c.view] = true;
      addLog(n, "좌표 확정", c.view + " · " + boxes.length + "개");
    });
    notify("좌표를 확정했습니다.");
  }
  function practice() {
    const a =
      assets.find(
        (a) => a.name === "XR7620 FA 4D 2.5 Front" && a.view === c.view,
      ) ||
      assets.find(
        (a) =>
          a.category === "server" &&
          a.view === c.view &&
          a.model?.startsWith("XR"),
      );
    if (!a) {
      notify("XR 실제 이미지가 보관함에 없습니다.");
      return;
    }
    update((n) => {
      n.composition.practice = true;
      n.composition.images[c.view] = a.id;
      n.composition.boxes[c.view] = [];
      n.composition.confirmed[c.view] = false;
      addLog(n, "XR 편집 연습", a.name + " · 견적 서버와 별개");
    });
  }
  function autoLink() {
    let count = 0;
    const next = deep(draft);
    next.data!.quote.items.forEach((it, index) => {
      if (!["nic", "hba"].includes(it.category) || !it.model) return;
      const token = String(it.model).match(
        /QLE\d{4}|X710(?:[-\w]+)?|\d{4,5}/i,
      )?.[0];
      if (!token) return;
      const variants = token === "2772" ? ["2772", "QLE2772"] : [token];
      const match = assets.filter(
        (a) =>
          a.category === "card" &&
          a.mount === it.mount &&
          variants.some((v) =>
            new RegExp(
              "(^|[^A-Z0-9])" +
                v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
                "($|[^A-Z0-9])",
              "i",
            ).test(a.name),
          ),
      );
      if (match.length === 1) {
        next.composition.mappings[index] = match[0].id;
        for (const v of ["front", "rear"] as const)
          for (const b of next.composition.boxes[v])
            if (b.part === index) b.assetId = match[0].id;
        count++;
      }
    });
    setDraft(next);
    notify(
      count + "개 자동 연결 · 유일하지 않거나 장착 형식이 다르면 보류합니다.",
    );
  }
  async function exportPNG() {
    if (!image) return;
    setBusy(true);
    try {
      const res = await fetch("/api/export/png", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_id: image.id,
          boxes,
          practice: c.practice,
        }),
      });
      if (!res.ok)
        throw Error((await res.json()).error || "PNG 합성에 실패했습니다.");
      download(
        (c.practice ? "XR-practice" : c.model) + "-" + c.view + "-draft.png",
        await res.blob(),
      );
      notify("Pillow로 실제 이미지와 라벨을 PNG로 저장했습니다.");
    } catch (e) {
      notify(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function exportCalibration() {
    download(
      "server.calibration.json",
      JSON.stringify(
        {
          schema_version: 1,
          reference: { width: 1000, height: 400 },
          quote_signature: await signature(draft),
          composition: c,
        },
        null,
        2,
      ),
    );
  }
  async function importCalibration(file: File) {
    try {
      if (file.size > 2 * 1024 * 1024) throw Error();
      const input = JSON.parse(await file.text()),
        nextC = input.composition;
      if (
        input.schema_version !== 1 ||
        input.reference?.width !== 1000 ||
        input.reference?.height !== 400 ||
        !["R760", "R660"].includes(nextC?.model) ||
        !["front", "rear"].includes(nextC?.view)
      )
        throw Error();
      for (const v of ["front", "rear"] as const) {
        if (!Array.isArray(nextC.boxes[v]) || nextC.boxes[v].length > 100)
          throw Error();
        for (const b of nextC.boxes[v])
          if (
            !/^[A-Za-z0-9-]{1,80}$/.test(b.id) ||
            !["Bay", "PCIe", "OCP", "LOM", "PSU", "Internal"].includes(
              b.kind,
            ) ||
            [b.x, b.y, b.w, b.h].some((x) => !Number.isFinite(x)) ||
            b.x < 0 ||
            b.y < 0 ||
            b.w <= 0 ||
            b.h <= 0 ||
            b.x + b.w > 1000 ||
            b.y + b.h > 400 ||
            (b.lineWidth != null && ![1, 2, 3, 4].includes(b.lineWidth)) ||
            (b.lineStyle != null && !["solid", "dashed"].includes(b.lineStyle))
          )
            throw Error();
        if (nextC.images[v] && !assets.some((a) => a.id === nextC.images[v])) {
          notify("보정 파일의 실제 이미지를 먼저 가져오세요.");
          return;
        }
      }
      const same = input.quote_signature === (await signature(draft));
      confirm(
        "보정 설정을 가져올까요?",
        "좌표는 다시 확정해야 합니다. " +
          (same
            ? "같은 견적의 연결을 유지합니다."
            : "다른 견적의 부품 배정은 해제합니다."),
        () => {
          update((n) => {
            n.composition = {
              ...fresh().composition,
              ...nextC,
              confirmed: { front: false, rear: false },
            };
            if (!same) invalidate(n);
            addLog(n, "보정 가져오기", file.name);
          });
          setSelected([]);
        },
        "가져오기",
      );
    } catch {
      notify("지원하는 보정 파일이 아닙니다. 형식과 좌표를 확인하세요.");
    }
  }
  function rules() {
    show(
      "판정 원칙",
      <>
        <div className="modal-body">
          <div className="rule-list">
            {[
              [
                "원문 근거가 우선입니다.",
                "모델·수량·RAID를 추정하지 않습니다. 코어·스레드·총용량과 개별 용량을 구분합니다.",
              ],
              [
                "성능과 장착 호환성은 별개입니다.",
                "공식 Dell 가이드가 미확인이면 라이저·CPU 종속 슬롯·베이·PSU는 검증 대기로 남깁니다.",
              ],
              [
                "OpenAI가 없어도 실행됩니다.",
                "키가 없거나 응답 검증이 실패하면 규칙 기반 예비 추출로 처리하고 이를 표시합니다.",
              ],
              [
                "실제 이미지와 근거만 사용합니다.",
                "다른 모델의 서버 그림과 PCIe/OCP 이미지를 대신 쓰지 않습니다. 베이 자동 감지는 아직 연결 전입니다.",
              ],
            ].map(([title, body]) => (
              <div key={title}>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <Button primary onClick={close}>
            확인
          </Button>
        </div>
      </>,
    );
  }

  const inputPage = (
    <>
      <Heading
        step={0}
        title="요구사항과 견적을 입력하세요"
        description="원문 근거를 보존하고 같은 기준으로 서버 구성을 검토합니다."
      >
        <Button
          id="load-example"
          onClick={() => {
            const apply = () =>
              update((n) => {
                n.requirement = example.requirement;
                n.quote = example.quote;
                n.data = null;
                invalidate(n);
                addLog(n, "예제 불러오기", "고객 제공 R760 문서");
              });
            if (draft.requirement || draft.quote)
              confirm(
                "예제 문서로 바꿀까요?",
                "입력과 추출 결과를 예제로 바꿉니다.",
                apply,
                "예제 불러오기",
              );
            else apply();
          }}
        >
          ↗ 예제 불러오기
        </Button>
      </Heading>
      <div className="notice">
        <span className="notice-icon">ⓘ</span>
        <div>
          <strong>정확한 추출이 검토의 시작입니다.</strong> 원문 그대로
          붙여넣으세요. 누락된 모델·수량은 추정하지 않습니다.
          <br />
          {configured
            ? "OpenAI 정형 추출을 사용할 수 있습니다. 응답이 원문 검증에 실패하면 예비 추출로 전환합니다."
            : "OpenAI 없이 규칙 기반 예비 추출로 실행 중입니다. 최종 승인 전 원문 검토가 필요합니다."}
        </div>
      </div>
      <div className="doc-grid">
        {(["requirement", "quote"] as const).map((key, i) => (
          <section className="card" key={key}>
            <div className="card-heading">
              <h2>
                <span className={"doc-icon " + (i ? "quote" : "")}>
                  {i ? "▤" : "≡"}
                </span>
                {i ? "견적사항" : "고객 요구사항"}
                <small>
                  {i
                    ? "제안한 부품 · 수량 · 소프트웨어"
                    : "요청 조건 · 성능 · 수량"}
                </small>
              </h2>
              <span className="pill">{i ? "QUOTE" : "REQUIREMENT"}</span>
            </div>
            <div className="doc-editor">
              <label htmlFor={key + "-input"}>
                문서 · 이메일 · 표의 내용을 그대로 붙여넣기
              </label>
              <textarea
                id={key + "-input"}
                maxLength={60000}
                value={draft[key]}
                disabled={busy}
                onChange={(e) => {
                  compareVersion.current++;
                  update((n) => { n[key] = e.target.value; n.data = null; invalidate(n); });
                }}
                placeholder={
                  i
                    ? "예) CPU : 인텔 제온 골드 5415+ 2.9G, 8C/16T * 2EA\nMEM : 32GB RDIMM * 4EA"
                    : "예) PowerEdge R760 Server\nCPU : 2.8GHz 이상 16코어 이상\n메모리 : 128GB 이상"
                }
              />
            </div>
            <div className="doc-footer">
              <span>HTML 표 · 줄바꿈 · 수량 표기 지원</span>
              <span>{draft[key].length.toLocaleString()} / 60,000자</span>
            </div>
          </section>
        ))}
      </div>
      <div className="scope-row" style={{ marginTop: 20 }}>
        <label>
          분석 방식{" "}
          <select
            id="analysis-engine"
            value={engine}
            onChange={(e) => setEngine(e.target.value)}
          >
            <option value="auto">자동 · OpenAI 없으면 예비 추출</option>
            <option value="rules">규칙 기반 예비 추출</option>
            <option value="openai" disabled={!configured}>
              OpenAI 정형 추출
            </option>
          </select>
        </label>
        <span className="muted">원문·근거·수정 이력을 보존합니다.</span>
      </div>
      <Footer note="원문과 검토값은 이 브라우저에 임시 저장됩니다.">
        <Button
          id="reset-docs"
          onClick={() =>
            confirm(
              "문서를 초기화할까요?",
              "원문·추출·조사 이력을 지웁니다. 실제 이미지와 보정은 유지합니다.",
              () =>
                update((n) => {
                  n.requirement = "";
                  n.quote = "";
                  n.data = null;
                  n.history = [];
                  n.research = [];
                  invalidate(n);
                }),
              "초기화",
            )
          }
        >
          초기화
        </Button>
        <Button
          primary
          id="analyze"
          disabled={busy}
          onClick={() => {
            if (draft.data)
              confirm(
                "원문에서 다시 추출할까요?",
                "수동 수정·검토 상태와 이전 부품 배정을 초기화합니다.",
                () => void analyze(),
                "다시 분석",
              );
            else void analyze();
          }}
        >
          {busy ? "두 문서 추출 중…" : "두 문서 예비 분석 →"}
        </Button>
      </Footer>
    </>
  );

  const reviewPage = draft.data && (
    <>
      <Heading
        step={1}
        title="추출한 값을 원문과 대조하세요"
        description="같은 형식으로 정리한 값을 확인하고 모호한 기준을 정해주세요."
      >
        <Button id="history-open" onClick={history}>
          ◷ 변경 이력 {draft.history.length}
        </Button>
      </Heading>
      <div className="overview">
        <Metric
          caption="서버 모델"
          value={modelName.replace("Dell PowerEdge ", "PowerEdge ")}
          sub={
            quoteModel
              ? "견적 원문 또는 수동 확인값"
              : "요구 모델 · 견적 모델 미명시"
          }
          warn={!quoteModel}
        />
        <Metric
          caption="견적 CPU · 서버 전체"
          value={total(draft.data, "cpu", "cores") ?? "확인 필요"}
          sub="CPU당 코어 × 명시 수량"
        />
        <Metric
          caption="견적 메모리 · 서버 전체"
          value={(total(draft.data, "memory", "capacity_gb") ?? "?") + " GB"}
          sub="모듈 용량 × 명시 수량"
        />
        <Metric
          caption="원문 검토 완료"
          value={reviewed + " / " + reviewItems.length}
          sub="확인된 항목만 검토 완료로 표시"
        />
      </div>
      <div className="notice warn">
        예비 분석 결과입니다. 서버 모델·수량·RAID·코어 기준을 확인하세요.{" "}
        {draft.data.requirement.warnings[0]} {draft.data.quote.warnings[0]}
      </div>
      <div className="scope-row">
        <label>
          CPU 코어 기준{" "}
          <select
            id="cpu-scope"
            value={draft.policy.cpu_core_scope}
            onChange={(e) => {
              const next = deep(draft);
              next.policy.cpu_core_scope = e.target.value;
              addLog(
                next,
                "비교 기준 변경",
                "CPU: " + e.target.selectedOptions[0].text,
              );
              void calculate(next);
            }}
          >
            <option value="unspecified">확인 필요 · 미지정</option>
            <option value="total">서버 전체 코어</option>
            <option value="per_cpu">CPU 한 개당 코어</option>
          </select>
        </label>
        <label>
          메모리 기준{" "}
          <select
            id="memory-scope"
            value={draft.policy.memory_scope}
            onChange={(e) => {
              const next = deep(draft);
              next.policy.memory_scope = e.target.value;
              addLog(
                next,
                "비교 기준 변경",
                "메모리: " + e.target.selectedOptions[0].text,
              );
              void calculate(next);
            }}
          >
            <option value="unspecified">확인 필요 · 미지정</option>
            <option value="total">서버 전체 용량</option>
            <option value="per_module">모듈 한 개당 용량</option>
          </select>
        </label>
        <span className="muted">기준 변경 이력을 기록합니다.</span>
      </div>
      <div className="section-title">
        <h2>공통 사양</h2>
        <Button id="add-item" small onClick={addItem}>
          ＋ 누락 항목 추가
        </Button>
      </div>
      <div className="card">
        <table className="spec-table">
          <thead>
            <tr>
              <th>구분</th>
              <th>고객 요구사항</th>
              <th>견적사항</th>
              <th>예비 판정</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(categories) as Category[])
              .filter((cat) => reviewItems.some((i) => i.category === cat))
              .map((cat) => (
                <tr key={cat}>
                  <td>
                    <span className="category-label">
                      <span className="category-symbol">▤</span>
                      {categories[cat]}
                    </span>
                  </td>
                  {(["requirement", "quote"] as const).map((key) => (
                    <td key={key}>
                      {draft
                        .data![key].items.map((it, index) => ({ it, index }))
                        .filter((v) => v.it.category === cat)
                        .map(({ it, index }) => (
                          <div className="spec-cell" key={index}>
                            <div>
                              <strong>{summary(it)}</strong>
                              <p>{quantities(it)}</p>
                              {it.issues.length > 0 && (
                                <p>
                                  <span className="warning-dot" />
                                  {it.issues[0]}
                                </p>
                              )}
                              <span
                                className={
                                  "review-badge " +
                                  (it.reviewed ? "complete" : "")
                                }
                              >
                                {it.reviewed
                                  ? "✓ 검토 완료"
                                  : it.manual
                                    ? "수동 입력 · 검토 필요"
                                    : "원문 검토 필요"}
                              </span>
                            </div>
                            <button
                              className="button"
                              data-edit={key + ":" + index}
                              onClick={() => editItem(key, index)}
                            >
                              검토
                            </button>
                          </div>
                        ))}
                      {!draft.data![key].items.some(
                        (i) => i.category === cat,
                      ) && (
                        <>
                          <span className="empty-field">원문에 미명시</span>
                          <br />
                          <button
                            className="button small text"
                            data-add={key + ":" + cat}
                            onClick={() => editItem(key, null, cat)}
                          >
                            ＋ 직접 확인 후 추가
                          </button>
                        </>
                      )}
                    </td>
                  ))}
                  <td>
                    {(() => {
                      const rows = draft.data!.comparison.rows.filter((r) => r.category === cat);
                      const status = rows.some((r) => r.status === "fail") ? "fail" : !rows.length || rows.some((r) => r.status === "unknown") ? "unknown" : "pass";
                      return <><Pill status={status} label={!rows.length ? "판정 없음" : undefined} />
                        {rows.length > 0 && <button className="button small row-verdict" onClick={() => show(categories[cat] + " 판정 근거", <div className="modal-body">{rows.map((row, index) => <div className="evidence" key={index}><strong>{row.title} · {row.status === "pass" ? "예비 충족" : row.status === "fail" ? "미충족" : "확인 필요"}</strong><p>요구: {row.expected}</p><p>견적: {row.actual}</p><p>{row.reason}</p></div>)}</div>)}>근거</button>}
                      </>;
                    })()}

                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {(["requirement", "quote"] as const).map(
        (key) =>
          draft.data![key].unparsed.length > 0 && (
            <div className="unparsed" key={key}>
              <details>
                <summary>
                  {key === "requirement" ? "요구사항" : "견적"} 미추출 원문{" "}
                  {draft.data![key].unparsed.length}개
                </summary>
                <div className="evidence">
                  {draft.data![key].unparsed.join("\n")}
                </div>
                <Button small onClick={() => editItem(key, null)}>
                  누락 항목 검토
                </Button>
              </details>
            </div>
          ),
      )}
      <Footer
        note={
          <>
            원문 검토 {reviewed} / {reviewItems.length}
          </>
        }
      >
        <Button onClick={() => go(0)}>← 문서 입력</Button>
        <Button
          primary
          id="go-results"
          onClick={() => go(2)}
        >
          판정 상세 보기

        </Button>
      </Footer>
    </>
  );

  const verdict =
    draft.data &&
    (tab === "compatibility"
      ? draft.data.compatibility
      : draft.data.comparison);
  const resultPage = draft.data && verdict && (
    <>
      <Heading
        step={2}
        title="판정 근거를 확인하세요"
        description="요구사항 충족과 실제 서버 장착 호환성을 따로 확인합니다."
      >
        <Button
          id="export-report"
          onClick={() =>
            download(
              "server-review.draft.json",
              JSON.stringify(
                { mode: "mockup", final_approved: false, ...draft },
                null,
                2,
              ),
            )
          }
        >
          ↓ 검토 결과 내보내기
        </Button>
      </Heading>
      <div className="result-banner">
        <div className="status-mark">
          {draft.data.comparison.status === "fail" ? "×" : "!"}
        </div>
        <div>
          <h2>
            {draft.data.comparison.status === "fail"
              ? "요구사항과 다른 항목이 있습니다"
              : "확인이 필요한 항목이 있습니다"}
          </h2>
          <p>
            원문 검토 {reviewed}/{reviewItems.length} · 공식 사양 검증 대기 ·
            최종 승인 전
          </p>
        </div>
        <div className="counts">
          {(["pass", "unknown", "fail"] as const).map((status) => (
            <div key={status}>
              <strong>{draft.data!.comparison.counts[status] || 0}</strong>
              <small>
                {status === "pass"
                  ? "예비 충족"
                  : status === "unknown"
                    ? "확인 필요"
                    : "미충족"}
              </small>
            </div>
          ))}
        </div>
      </div>
      <div className="tabbar">
        {[
          ["requirements", "요구사항 충족"],
          ["compatibility", "장착 호환성"],
          ["research", "조사 요청"],
        ].map(([value, label]) => (
          <button
            key={value}
            data-tab={value}
            className={tab === value ? "active" : ""}
            onClick={() => {
              setTab(value);
              setFilter("all");
            }}
          >
            {label}
            <span>
              {value === "research"
                ? draft.research.length
                : value === "compatibility"
                  ? draft.data!.compatibility.rows.length
                  : draft.data!.comparison.rows.length}
            </span>
          </button>
        ))}
      </div>
      {tab === "research" ? (
        draft.research.length ? (
          draft.research.map((r, i) => (
            <article className="result-row" key={i}>
              <div className="result-row-top">
                <h3>{r.title}</h3>
                <Pill
                  status="unknown"
                  label={
                    r.status === "pending"
                      ? "조사 요청 저장"
                      : "조사 초안 · 검토 필요"
                  }
                />
              </div>
              <p className="reason">{r.question}</p>
              <p className="field-caption">{r.text}</p>
              <div className="buttons">
                <button
                  className="button small"
                  data-research-view={i}
                  onClick={() => investigate(r, true)}
                >
                  요청 보기
                </button>
                <button
                  className="button small"
                  onClick={() =>
                    confirm(
                      "조사 요청을 삭제할까요?",
                      "추출값과 판정은 유지합니다.",
                      () => update((n) => n.research.splice(i, 1)),
                      "삭제",
                    )
                  }
                >
                  삭제
                </button>
              </div>
            </article>
          ))
        ) : (
          <div className="card empty-state">
            <h3>공식 자료 조사 요청이 없습니다.</h3>
            <p>확인 필요 항목의 공식 자료 조사 버튼을 사용하세요.</p>
            <Button
              id="research-back"
              onClick={() => {
                setTab("requirements");
                setFilter("unknown");
              }}
            >
              확인 필요 항목 보기
            </Button>
          </div>
        )
      ) : (
        <>
          <div className="filter-row">
            <div>
              {[
                ["all", "전체"],
                ["unknown", "확인 필요"],
                ["fail", "미충족"],
                ["pass", "충족"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  data-filter={value}
                  className={
                    "filter-button " + (filter === value ? "active" : "")
                  }
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="muted">원문 명시값과 공식 출처를 확인합니다.</span>
          </div>
          {verdict.rows
            .map((row, index) => ({ row, index }))
            .filter(({ row }) => filter === "all" || row.status === filter)
            .map(({ row, index }) => (
              <article className="result-row" key={index}>
                <div className="result-row-top">
                  <h3>{row.title}</h3>
                  <Pill
                    status={row.status}
                    label={tab === "compatibility" && row.status === "unknown" ? "검증 대기" : undefined}
                  />
                </div>
                <div className="compare-values">
                  <div>
                    <small>요구사항/확인 조건</small>
                    <span>{row.expected}</span>
                  </div>
                  <div>
                    <small>견적/결과</small>
                    <span>{row.actual || "미확인"}</span>
                  </div>
                </div>
                <p className="reason">{row.reason}</p>
                <div className="result-actions">
                  <button
                    className="button small"
                    data-evidence={index}
                    onClick={() => inspect(row)}
                  >
                    원문 근거 보기
                  </button>
                  {row.status !== "pass" && (
                    <button
                      className="button small soft"
                      data-research={index}
                      onClick={() => investigate(row)}
                    >
                      공식 자료 조사
                    </button>
                  )}
                  <Button small onClick={() => go(1)}>
                    추출값 수정 ↗
                  </Button>
                </div>
              </article>
            ))}
        </>
      )}
      <p className="report-stamp">
        예비 비교 · 부품 지원/라이선스 인증서가 아닙니다.
      </p>
      <Footer note="이미지 배치와 장착 호환 판정은 별개입니다.">
        <Button onClick={() => go(1)}>← 추출값 검토</Button>
        <button className="button primary" data-next="3" onClick={() => go(3)}>
          서버 이미지 구성 →
        </button>
      </Footer>
    </>
  );

  const compositionPage = (
    <>
      <Heading
        step={3}
        title="견적 구성을 실제 이미지 위에 배치하세요"
        description="실제 Dell 이미지와 PC 보정값으로 구성 배치안을 만듭니다."
      >
        <div className="buttons">
          <Button
            id="calibration-export"
            onClick={() => void exportCalibration()}
          >
            보정 파일 내보내기
          </Button>
          <Button
            id="png-export"
            primary
            disabled={!image || busy}
            onClick={() => void exportPNG()}
          >
            ↓ PNG 저장
          </Button>
        </div>
      </Heading>
      <div className={"notice " + (c.practice ? "warn" : "subtle")}>
        {c.practice ? (
          <div>
            <strong>XR 이미지로 편집 흐름을 연습하는 중입니다.</strong>{" "}
            R760/R660 견적 또는 장착 가능성을 나타내지 않습니다.
          </div>
        ) : (
          <div>
            <strong>견적 서버 모델: {String(quoteModel || "미명시")}</strong> ·
            시각화 대상은 {c.model} 배치안입니다. 이미지가 호환성의 근거는
            아닙니다.
          </div>
        )}
      </div>
      <div className="composition-layout">
        <div>
          <section className="card">
            <div className="canvas-tools">
              <div className="view-switch">
                {(["front", "rear"] as const).map((v) => (
                  <button
                    key={v}
                    data-view={v}
                    className={c.view === v ? "active" : ""}
                    onClick={() => {
                      update((n) => (n.composition.view = v));
                      setSelected([]);
                    }}
                  >
                    {v === "front" ? "전면" : "후면"}
                  </button>
                ))}
              </div>
              <div className="buttons">
                {c.practice && (
                  <span className="practice-label">XR 편집 연습</span>
                )}
                <Button
                  id="base-image"
                  small
                  onClick={() => openLibrary({ purpose: "base" })}
                >
                  {image ? "서버 이미지 변경" : "서버 이미지 선택"}
                </Button>
                <Button
                  small
                  id="coordinate-help"
                  onClick={() =>
                    show(
                      "보정 방법",
                      <div className="modal-body">
                        <div className="instruction">
                          영역은 실제 위치로 드래그하거나 숫자로 보정합니다.
                          Shift+클릭은 다중 선택, 방향키는 1 단위,
                          Shift+방향키는 10 단위 이동입니다. 이동하면 좌표
                          확정을 다시 해야 합니다. 라벨은 별도로 드래그할 수
                          있습니다. 빈 PSU는 EMPTY, 빈 베이는 실제 필러 이미지를
                          사용합니다.
                        </div>
                        <Button onClick={close}>확인</Button>
                      </div>,
                    )
                  }
                >
                  보정 도움말
                </Button>
              </div>
            </div>
            <div className="canvas-control">
              <Button
                small
                id="detect-bays"
                disabled={!image || c.view !== "front"}
                onClick={() =>
                  show(
                    "베이 자동 감지 · 흐름 검토",
                    <>
                      <div className="modal-body">
                        <div className="notice warn">
                          실제 베이 감지는 아직 연결하지 않았습니다. 후보 감지 →
                          잘못된 영역 제거 → 인치 지정 → 좌표 확정 흐름을
                          검토합니다.
                        </div>
                      </div>
                      <div className="modal-footer">
                        <Button onClick={close}>취소</Button>
                        <Button id="detect-manual" primary onClick={addBox}>
                          직접 영역 추가
                        </Button>
                      </div>
                    </>,
                  )
                }
              >
                베이 자동 감지
              </Button>
              <Button small id="add-box" disabled={!image} onClick={addBox}>
                ＋ {c.view === "front" ? "베이" : "슬롯·PSU"} 영역
              </Button>
              <Button
                small
                id="confirm-coordinates"
                disabled={!boxes.length}
                onClick={confirmCoordinates}
              >
                {c.confirmed[c.view] ? "✓ 좌표 확정됨" : "좌표 확정"}
              </Button>
              <Button
                small
                id="fill-bays"
                disabled={!selected.length || c.view !== "front"}
                onClick={() => {
                  if (
                    !boxes.some(
                      (b) =>
                        selected.includes(b.id) &&
                        b.kind === "Bay" &&
                        b.part == null,
                    )
                  ) {
                    notify("빈 베이 영역을 선택하세요.");
                    return;
                  }
                  openLibrary({ purpose: "filler" });
                }}
              >
                빈 베이 필러
              </Button>
              <Button
                small
                id="auto-layout"
                disabled={!boxes.length}
                onClick={() =>
                  update((n) =>
                    n.composition.boxes[c.view].forEach((b, i) => {
                      b.lx = 85 + (i % 6) * 162;
                      b.ly = i < 6 ? 55 : 340;
                      b.connector = true;
                    }),
                  )
                }
              >
                라벨 자동 배치
              </Button>
              <Button
                small
                id="bold-label"
                disabled={!selected.length}
                onClick={() => {
                  const bold = !boxes
                    .filter((b) => selected.includes(b.id))
                    .every((b) => b.bold);
                  update((n) =>
                    n.composition.boxes[c.view]
                      .filter((b) => selected.includes(b.id))
                      .forEach((b) => (b.bold = bold)),
                  );
                }}
              >
                굵게
              </Button>
              <Button
                small
                id="delete-box"
                disabled={!selected.length}
                onClick={() =>
                  confirm(
                    "선택 영역을 삭제할까요?",
                    "배정과 좌표를 제거하지만 견적 부품은 유지합니다.",
                    () => {
                      update((n) => {
                        n.composition.boxes[c.view] = n.composition.boxes[
                          c.view
                        ].filter((b) => !selected.includes(b.id));
                        n.composition.confirmed[c.view] = false;
                      });
                      setSelected([]);
                    },
                    "삭제",
                  )
                }
              >
                선택 삭제
              </Button>
            </div>
            <div className="drawing-toolbar" role="toolbar" aria-label="라벨과 연결선 도구">
              <Button small disabled={!selected.length} onClick={() => document.getElementById("label-text")?.focus()}>T 라벨 편집</Button>
              <label>연결선
                <select id="line-style" disabled={!selected.length} value={selectedBox?.connector === false ? "none" : selectedBox?.lineStyle || "solid"}
                  onChange={(e) => update((n) => n.composition.boxes[c.view].filter((b) => selected.includes(b.id)).forEach((b) => { b.connector = e.target.value !== "none"; b.lineStyle = e.target.value === "dashed" ? "dashed" : "solid"; }))}>
                  <option value="solid">실선</option><option value="dashed">점선</option><option value="none">숨김</option>
                </select>
              </label>
              <label>선 굵기
                <select id="line-width" disabled={!selected.length} value={selectedBox?.lineWidth || 1}
                  onChange={(e) => update((n) => n.composition.boxes[c.view].filter((b) => selected.includes(b.id)).forEach((b) => { b.lineWidth = Number(e.target.value); }))}>
                  {[1, 2, 3, 4].map((v) => <option key={v} value={v}>{v} px</option>)}
                </select>
              </label>
              <Button small id="align-labels" disabled={selected.length < 2} onClick={() => update((n) => {
                const targets = n.composition.boxes[c.view].filter((b) => selected.includes(b.id));
                const y = targets[0].ly ?? targets[0].y - 18;
                targets.forEach((b) => { b.ly = y; });
              })}>라벨 수평 정렬</Button>
              <span className="muted">선택 {selected.length}개 · Shift+클릭 다중 선택</span>
            </div>
            <div className="canvas-wrap" id="canvas-wrap">
              {image ? (
                <div style={{ width: `${zoom}%`, minWidth: "100%" }}><Canvas
                  asset={image}
                  assets={assets}
                  composition={c}
                  selected={selected}
                  editMode={editorMode}
                  onSelect={(id, multi) =>
                    setSelected((prev) =>
                      !id
                        ? []
                        : multi
                          ? prev.includes(id)
                            ? prev.filter((v) => v !== id)
                            : [...prev, id]
                          : prev.includes(id)
                            ? prev
                            : [id],
                    )
                  }
                  onMove={moveBoxes}
                /></div>
              ) : (
                <div className="empty-state" style={{ minHeight: 350 }}>
                  <span className="empty-symbol">▧</span>
                  <h3>
                    {c.model} {c.view === "front" ? "전면" : "후면"} 스텐실을
                    선택하세요.
                  </h3>
                  <p>
                    RackServers 원본에서 해당 모델의 실제 이미지를 가져옵니다.
                    XR 그림을 R760/R660 대신 사용하지 않습니다.
                  </p>
                  <div className="buttons">
                    <Button
                      primary
                      id="empty-import"
                      onClick={() => stencilRef.current?.click()}
                    >
                      스텐실 가져오기
                    </Button>
                    <Button id="practice-start" onClick={practice}>
                      XR 이미지로 편집 연습
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <div className="canvas-meta">
              <span>
                {image
                  ? image.name + " · " + image.source
                  : "실제 이미지 선택 전"}
              </span>
              <span>좌표 기준 1000 × 400 · {boxes.length}개 영역</span>
            </div>

          </section>
          <div className="bom-title">
            <span>견적 부품</span>
            <button
              className="button small text"
              id="auto-link"
              disabled={!draft.data}
              onClick={autoLink}
            >
              모델 토큰으로 자동 연결
            </button>
          </div>
          <div className="card">
            {(draft.data?.quote.items || [])
              .map((it, index) => ({ it, index }))
              .filter(({ it }) =>
                ["cpu", "memory", "ssd", "hdd", "nic", "hba", "psu"].includes(
                  it.category,
                ),
              )
              .map(({ it, index }) => (
                <div className="bom-row" key={index}>
                  <span className="bom-icon">▣</span>
                  <div>
                    <strong>{it.model || categories[it.category]}</strong>
                    <p>
                      {summary(it)} · {quantities(it)}
                    </p>
                  </div>
                  {it.mount && <span className="pill">{it.mount}</span>}
                  <button
                    className="button small"
                    data-part-image={index}
                    onClick={() =>
                      openLibrary({ purpose: "part", partIndex: index })
                    }
                  >
                    {c.mappings[index] ? "이미지 변경" : "이미지 연결"}
                  </button>
                  <button
                    className="button small soft"
                    data-place-part={index}
                    disabled={!image || !c.confirmed[c.view]}
                    onClick={() => place(index)}
                  >
                    배치
                  </button>
                </div>
              ))}
          </div>
        </div>
        <aside className="side-panel">
          <section className="card">
            <div className="panel-title">
              보정 · 선택 영역 {selected.length || ""}
            </div>
            <div className="panel-content">
              <label>시각화 대상 모델</label>
              <select
                id="visual-model"
                value={c.model}
                onChange={(e) => {
                  const model = e.target.value as "R760" | "R660";
                  confirm(
                    "시각화 모델을 바꿀까요?",
                    "이미지와 좌표를 초기화합니다. 문서의 견적 모델은 바뀌지 않습니다.",
                    () =>
                      update((n) => {
                        n.composition = { ...fresh().composition, model };
                      }),
                    "모델 변경",
                  );
                }}
              >
                <option>R760</option>
                <option>R660</option>
              </select>
              <p className="field-caption">
                요구 모델의 배치안입니다. 견적 모델은 별도로 확인합니다.
              </p>
              <label>영역 선택</label>
              <select
                id="box-select"
                value={selected[0] || ""}
                onChange={(e) =>
                  setSelected(e.target.value ? [e.target.value] : [])
                }
              >
                <option value="">선택 안 됨</option>
                {boxes.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} · {b.kind}
                  </option>
                ))}
              </select>
              <div className="field-grid">
                {(["x", "y", "w", "h"] as const).map((f) => (
                  <div key={f}>
                    <label>
                      {f === "x"
                        ? "X 위치"
                        : f === "y"
                          ? "Y 위치"
                          : f === "w"
                            ? "너비"
                            : "높이"}
                    </label>
                    <input
                      id={"coord-" + f}
                      type="number"
                      disabled={!selectedBox}
                      value={selectedBox ? Math.round(selectedBox[f]) : ""}
                      onChange={(e) => coordinate(f, Number(e.target.value))}
                    />
                  </div>
                ))}
              </div>
              <label>라벨 텍스트</label>
              <input
                id="label-text"
                disabled={!selectedBox}
                value={selectedBox?.label || ""}
                onChange={(e) =>
                  update((n) =>
                    n.composition.boxes[c.view]
                      .filter((b) => selected.includes(b.id))
                      .forEach((b) => (b.label = e.target.value.slice(0, 100))),
                  )
                }
              />
              <div className="toggle-line">
                <span>가이드 표시</span>
                <input
                  id="guides-toggle"
                  type="checkbox"
                  checked={c.guides}
                  onChange={(e) =>
                    update((n) => (n.composition.guides = e.target.checked))
                  }
                />
              </div>
              <div className="toggle-line">
                <span>스냅 (5 단위)</span>
                <input
                  id="snap-toggle"
                  type="checkbox"
                  checked={c.snap}
                  onChange={(e) =>
                    update((n) => (n.composition.snap = e.target.checked))
                  }
                />
              </div>
              <div className="toggle-line">
                <span>연결선 표시</span>
                <input
                  id="connector-toggle"
                  type="checkbox"
                  disabled={!selectedBox}
                  checked={selectedBox?.connector !== false}
                  onChange={(e) =>
                    update((n) =>
                      n.composition.boxes[c.view]
                        .filter((b) => selected.includes(b.id))
                        .forEach((b) => (b.connector = e.target.checked)),
                    )
                  }
                />
              </div>
              <p className="field-caption">
                Shift+클릭: 다중 선택
                <br />
                방향키: 1 단위 · Shift: 10 단위
              </p>
            </div>
          </section>
          <section className="card">
            <div className="panel-title">이 PC의 보정 설정</div>
            <div className="panel-content">
              <p className="instruction">
                보정·이미지 연결은 이 브라우저에 저장하고 커밋하지 않습니다.
              </p>
              <div className="buttons">
                <Button small id="calibration-save" onClick={save}>
                  저장
                </Button>
                <Button
                  small
                  id="calibration-import"
                  onClick={() => calibrationRef.current?.click()}
                >
                  가져오기
                </Button>
              </div>
              <Button
                small
                id="practice-exit"
                disabled={!c.practice}
                onClick={() =>
                  confirm(
                    "XR 연습을 종료할까요?",
                    "연습 좌표를 초기화합니다.",
                    () =>
                      update(
                        (n) =>
                          (n.composition = {
                            ...fresh().composition,
                            model: c.model,
                          }),
                      ),
                  )
                }
              >
                XR 연습 종료
              </Button>
            </div>
          </section>
        </aside>
      </div>
      <Footer note="구성 배치안 · 최종 승인 전 · 이미지와 호환성은 별개입니다.">
        <Button onClick={() => go(2)}>← 판정 확인</Button>
        <Button
          primary
          id="review-summary"
          onClick={() =>
            show(
              "검토 요약",
              <>
                <div className="modal-body">
                  <div className="rule-list">
                    <div>
                      <h3>문서 추출</h3>
                      <p>
                        원문 검토 {reviewed}/{reviewItems.length} · 수정 이력{" "}
                        {draft.history.length}개
                      </p>
                    </div>
                    <div>
                      <h3>판정</h3>
                      <p>
                        확인 필요 {draft.data?.comparison.counts.unknown || 0}개
                        · 공식 Dell 사양 검증 대기
                      </p>
                    </div>
                    <div>
                      <h3>이미지</h3>
                      <p>
                        {c.practice
                          ? "XR 연습 · 견적 서버와 별개"
                          : c.model + " 배치안"}{" "}
                        · 전면 {c.boxes.front.length} / 후면{" "}
                        {c.boxes.rear.length}개
                      </p>
                    </div>
                    <div>
                      <h3>최종 승인</h3>
                      <p>
                        미확인 원문·공식 지원 조건을 해소하기 전에는 최종
                        승인하지 않습니다.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <Button
                    id="summary-results"
                    onClick={() => {
                      close();
                      go(2);
                    }}
                  >
                    판정으로 돌아가기
                  </Button>
                  <Button primary onClick={close}>
                    계속 검토
                  </Button>
                </div>
              </>,
            )
          }
        >
          검토 요약 확인
        </Button>
      </Footer>
    </>
  );

  const preview = (
    <section id="preview-panel" className="preview-panel">
      <div className="panel-heading"><h2>서버 이미지 구성</h2><Button small id="open-editor" onClick={() => go(3)}>크게 편집 ↗</Button></div>
      <div className="preview-views">
        {(["front", "rear"] as const).map((view) => {
          const artwork = assets.find((a) => a.id === c.images[view]);
          return <button key={view} className="image-preview" data-preview={view} aria-label={(view === "front" ? "전면" : "후면") + " 서버 이미지 편집"}
            onClick={() => { update((n) => { n.composition.view = view; }); setSelected([]); setEditorOpen(true); }}>
            <span>{view === "front" ? "전면" : "후면"} <small>{c.practice ? "XR 연습" : c.model + " 배치안"}</small></span>
            {artwork ? <Canvas asset={artwork} assets={assets} composition={{ ...c, view, guides: false }} selected={[]} onSelect={() => {}} onMove={() => {}} readOnly id={"preview-" + view} />
              : <div className="preview-empty">▧ 실제 스텐실 선택<span>클릭하여 이미지 연결·부품 배치</span></div>}
          </button>;
        })}
      </div>
      <p className="preview-note">{c.practice ? "XR 편집 연습 · 견적 서버와 별개" : "이미지 배치와 장착 호환 판정은 별개입니다."}</p>
    </section>
  );

  return (
    <>
      <div className="workspace unified-workspace">
        <header className="topbar">
          <a className="brand" href="#documents-panel"><span className="brand-mark">SV</span><span>Server Validator<small>서버 구성 통합 검토</small></span></a>
          <div className="top-actions">
            <span className="mock-tag">예비 검토</span>
            <span className="connection">{configured ? "AI 설정됨" : "OpenAI 없이 실행"}</span>
            <Button small id="library-open" onClick={() => openLibrary()}>이미지 보관함 {assets.length}</Button>
            <Button small id="rules-open" onClick={rules}>판정 원칙</Button>
            <Button small id="save-draft" onClick={save}>임시 저장</Button>
          </div>
        </header>
        <main>
          <div className="workspace-heading"><div><h1>서버 구성 검토</h1><p>원문과 사양을 나란히 비교하고, 판정 근거와 실제 이미지 구성을 함께 확인하세요.</p></div>
            <nav className="workspace-nav" aria-label="검토 영역">{steps.map((step, index) => <button key={step} data-step={index} onClick={() => go(index)}>{step}</button>)}</nav>
          </div>
          <section id="documents-panel" className={"work-panel documents-panel " + (documentsOpen ? "expanded" : "")} aria-label="문서 입력">
            <div className="panel-heading"><h2><span>01</span> 요구사항 · 견적 원문</h2><Button small id="toggle-documents" onClick={() => setDocumentsOpen(!documentsOpen)}>{documentsOpen ? "원문 접기 ↑" : "원문 보기·다시 분석 ↓"}</Button></div>
            {documentsOpen && <div className="panel-scroll">{inputPage}</div>}
          </section>
          <div className="review-workspace">
            <section id="specifications-panel" className="work-panel specifications-panel" aria-label="추출값 검토">
              <div className="panel-heading"><h2><span>02</span> 요구사항 ↔ 견적 · 공통 사양 비교</h2><small>{reviewed}/{reviewItems.length} 원문 검토</small></div>
              <div className="panel-scroll">{reviewPage || <div className="workspace-empty"><span>≡</span><h3>두 문서를 같은 사양으로 정리합니다</h3><p>위에 요구사항과 견적을 입력한 후 분석하세요.<br/>모델·수량·성능과 원문 근거를 대조할 수 있습니다.</p></div>}</div>
            </section>
            <aside className="work-panel outcome-panel" aria-label="이미지 구성과 판정">
              {preview}
              <section id="verdict-panel" className="verdict-panel" aria-label="판정 확인">
                <div className="panel-heading"><h2><span>03</span> 판정 상세 · 공식 자료 확인</h2><small>최종 승인 전</small></div>
                <div className="panel-scroll">{resultPage || <div className="workspace-empty"><h3>분석 후 예비 판정이 표시됩니다</h3><p>요구사항 충족과 장착 호환성을 나누어 확인합니다. 원문을 바꾸면 다시 분석하세요.</p></div>}</div>
              </section>
            </aside>
          </div>
        </main>
      </div>
      {editorOpen && <Modal id="image-editor" className="image-editor" title="서버 이미지 상세 편집" subtitle="실제 스텐실 위에서 영역을 선택한 뒤 상단 도구로 라벨과 연결선을 편집하세요." onClose={() => { setEditorOpen(false); setSelected([]); }}>
        <div className="editor-navigation">
          <div className="editor-tabs" role="tablist" aria-label="이미지 편집 작업">
            {([['configuration', '구성'], ['labels', '라벨·연결선'], ['coordinates', '좌표 보정']] as const).map(([mode, title]) => <button key={mode} role="tab" aria-selected={editorMode === mode} data-editor-mode={mode} onClick={() => setEditorMode(mode)}>{title}</button>)}
          </div>
          <div className="zoom-tools"><button aria-label="축소" disabled={zoom <= 100} onClick={() => setZoom(Math.max(100, zoom - 25))}>−</button><button aria-label="이미지 맞춤" onClick={() => setZoom(100)}>{zoom}%</button><button aria-label="확대" disabled={zoom >= 200} onClick={() => setZoom(Math.min(200, zoom + 25))}>＋</button></div>
        </div>
        <div className={"editor-body mode-" + editorMode}>{compositionPage}</div>
        <div className="modal-footer"><p>변경 사항은 비교 화면과 이 브라우저의 임시 저장에 바로 반영됩니다.</p><Button primary id="editor-done" onClick={() => { setEditorOpen(false); setSelected([]); }}>편집 완료</Button></div>
      </Modal>}
      {dialog && (
        <Modal title={dialog.title} subtitle={dialog.subtitle} onClose={close}>
          {dialog.body}
        </Modal>
      )}
      {library && (
        <Modal
          title={
            library.purpose === "base"
              ? "서버 이미지 선택"
              : library.partIndex != null
                ? String(
                    draft.data!.quote.items[library.partIndex].model ||
                      categories[
                        draft.data!.quote.items[library.partIndex].category
                      ],
                  ) + " 이미지 연결"
                : library.purpose === "filler"
                  ? "빈 베이 필러 이미지"
                  : "실제 이미지 보관함"
          }
          subtitle="원본 이름·출처·장착 형식을 확인하세요."
          onClose={close}
        >
          <Library
            assets={assets}
            context={library}
            part={
              library.partIndex != null
                ? draft.data!.quote.items[library.partIndex]
                : undefined
            }
            composition={c}
            onSelect={selectAsset}
            onStencil={() => stencilRef.current?.click()}
            onImage={() => imageRef.current?.click()}
          />
          <div className="modal-footer">
            <p>이미지 연결은 공식 장착 지원을 보증하지 않습니다.</p>
            <Button onClick={close}>닫기</Button>
          </div>
        </Modal>
      )}
      <div
        id="toast"
        role="status"
        aria-live="polite"
        className={message ? "show" : ""}
      >
        {message}
      </div>
      <input
        id="stencil-upload"
        ref={stencilRef}
        type="file"
        accept=".vssx,.vsdx"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importStencil(f);
          e.target.value = "";
        }}
      />
      <input
        id="image-upload"
        ref={imageRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void addImage(f);
          e.target.value = "";
        }}
      />
      <input
        id="calibration-upload"
        ref={calibrationRef}
        type="file"
        accept=".json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importCalibration(f);
          e.target.value = "";
        }}
      />
    </>
  );
}

function total(data: Analysis, category: Category, field: Field) {
  const rows = data.quote.items.filter((i) => i.category === category);
  return rows.length &&
    rows.every((i) => i[field] != null && i.quantity != null)
    ? rows.reduce((sum, i) => sum + Number(i[field]) * Number(i.quantity), 0)
    : null;
}
function AddItem({
  onNext,
  onClose,
}: {
  onNext: (key: "requirement" | "quote", category: Category) => void;
  onClose: () => void;
}) {
  const [key, setKey] = useState<"requirement" | "quote">("quote"),
    [category, setCategory] = useState<Category>("server");
  return (
    <>
      <div className="modal-body">
        <div className="form-grid">
          <div>
            <label>문서</label>
            <select
              id="new-document"
              value={key}
              onChange={(e) =>
                setKey(e.target.value as "quote" | "requirement")
              }
            >
              <option value="quote">견적사항</option>
              <option value="requirement">고객 요구사항</option>
            </select>
          </div>
          <div>
            <label>구분</label>
            <select
              id="new-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
            >
              {(Object.keys(categories) as Category[]).map((v) => (
                <option key={v} value={v}>
                  {categories[v]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="modal-footer">
        <Button onClick={onClose}>취소</Button>
        <Button
          id="new-item-next"
          primary
          onClick={() => onNext(key, category)}
        >
          입력하기 →
        </Button>
      </div>
    </>
  );
}
function ResearchForm({
  title,
  question,
  configured,
  readOnly,
  existing,
  onSave,
  onClose,
}: {
  title: string;
  question: string;
  configured: boolean;
  readOnly: boolean;
  existing?: Research;
  onSave: (q: string) => Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState(question),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <div className="modal-body">
        <div className="notice warn">
          {configured
            ? "OpenAI 공식 자료 조사 초안입니다. 출처를 직접 검토하고 판정을 보완하세요."
            : "OpenAI가 없어 요청만 저장합니다. 실제 검색은 미실행 상태입니다."}
        </div>
        <label className="field-caption">확인할 질문</label>
        <textarea
          id="research-question"
          className="research-text"
          value={text}
          readOnly={readOnly}
          onChange={(e) => setText(e.target.value)}
        />
        {existing?.text && <div className="evidence">{existing.text}</div>}
        {existing?.citations?.map((cite, i) => (
          <p key={i}>
            <a href={cite.url} target="_blank" rel="noopener noreferrer">
              {cite.title} ↗
            </a>
          </p>
        ))}
        <p className="instruction">
          Dell Technical Guide, 부품 제조사 데이터시트, Microsoft 라이선스
          문서에서 모델·부품번호·표 위치·개정일을 확인합니다.
        </p>
        <div className="buttons">
          <a
            className="button small"
            href="https://www.dell.com/support/home/ko-kr"
            target="_blank"
            rel="noopener noreferrer"
          >
            Dell 공식 지원 열기 ↗
          </a>
          <Button
            small
            id="copy-question"
            onClick={() =>
              void navigator.clipboard
                .writeText(text)
                .catch(() => setError("질문을 선택해 직접 복사하세요."))
            }
          >
            질문 복사
          </Button>
        </div>
        {error && <p className="form-error">{error}</p>}
      </div>
      <div className="modal-footer">
        <Button onClick={onClose}>닫기</Button>
        {!readOnly && (
          <Button
            id="save-research"
            primary
            disabled={busy || !text.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave(text);
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy
              ? "처리 중…"
              : configured
                ? "공식 자료 조사 실행"
                : "조사 요청 저장"}
          </Button>
        )}
      </div>
    </>
  );
}
function PlaceForm({
  item,
  options,
  count,
  practice,
  onSave,
  onClose,
}: {
  item: Item;
  options: Box[];
  count: number;
  practice: boolean;
  onSave: (id: string) => void;
  onClose: () => void;
}) {
  const [target, setTarget] = useState(options[0]?.id || "");
  return (
    <>
      <div className="modal-body">
        <div className="evidence">
          {summary(item)}
          {"\n"}
          {quantities(item)} · 현재 배치 {count}개
        </div>
        {practice && (
          <div className="notice warn">
            XR 편집 연습입니다. 견적 서버 장착 가능을 나타내지 않습니다.
          </div>
        )}
        {options.length ? (
          <select
            id="place-target"
            className="wide-select"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            {options.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} · {b.kind}
                {b.sizeIn ? " · " + b.sizeIn + "인치" : ""}
              </option>
            ))}
          </select>
        ) : (
          <div className="notice warn">
            같은 형식의 빈 영역이 없습니다. 영역과 장착 형식을 확인하세요.
          </div>
        )}
      </div>
      <div className="modal-footer">
        <Button onClick={onClose}>취소</Button>
        <Button
          id="apply-placement"
          primary
          disabled={
            !target || (item.quantity != null && count >= Number(item.quantity))
          }
          onClick={() => onSave(target)}
        >
          1개 배치
        </Button>
      </div>
    </>
  );
}
