export type Category =
  | "server"
  | "cpu"
  | "memory"
  | "ssd"
  | "hdd"
  | "nic"
  | "hba"
  | "raid"
  | "os"
  | "cal"
  | "psu"
  | "rack"
  | "support";
export type Status = "pass" | "fail" | "unknown";
export type Field =
  | "model"
  | "quantity"
  | "capacity_gb"
  | "clock_ghz"
  | "cores"
  | "ports"
  | "speed_gbps"
  | "interface"
  | "size_in"
  | "mount"
  | "height"
  | "rpm"
  | "watts"
  | "raid_level"
  | "license_cores"
  | "cal_count"
  | "cal_type"
  | "redundancy"
  | "rank"
  | "memory_mts"
  | "duration_months";
export type Item = {
  category: Category;
  evidence: string;
  confidence: "explicit" | "ambiguous";
  issues: string[];
  reviewed?: boolean;
  manual?: boolean;
} & Record<Field, string | number | null>;
export interface Extraction {
  kind: string;
  text: string;
  items: Item[];
  unparsed: string[];
  method: string;
  warnings: string[];
}
export interface Row {
  category?: Category | null;
  title: string;
  status: Status;
  expected: string;
  actual: string;
  reason: string;
  evidence: string[];
}
export interface Verdict {
  status: Status;
  rows: Row[];
  counts: Partial<Record<Status, number>>;
}
export interface Analysis {
  requirement: Extraction;
  quote: Extraction;
  comparison: Verdict;
  compatibility: Verdict;
}
export interface Asset {
  id: string;
  name: string;
  aliases?: string[];
  url: string;
  file?: string;
  category: string;
  model: string | null;
  view: "front" | "rear" | null;
  mount: string | null;
  source: string;
  embedded_path?: string;
  note?: string;
  blob?: Blob;
}
export interface Box {
  id: string;
  kind: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  part: number | null;
  assetId: string | null;
  sizeIn: number | null;
  lx?: number;
  ly?: number;
  bold?: boolean;
  connector?: boolean;
  lineStyle?: "solid" | "dashed";
  lineWidth?: number;
}
export interface Composition {
  model: "R760" | "R660";
  view: "front" | "rear";
  practice: boolean;
  images: Partial<Record<"front" | "rear", string>>;
  boxes: Record<"front" | "rear", Box[]>;
  mappings: Record<string, string>;
  guides: boolean;
  snap: boolean;
  confirmed: Record<"front" | "rear", boolean>;
}
export interface Research {
  title: string;
  question: string;
  status: string;
  text?: string;
  citations?: { url: string; title: string }[];
}
export interface Draft {
  version: 2;
  step: number;
  requirement: string;
  quote: string;
  data: Analysis | null;
  policy: { cpu_core_scope: string; memory_scope: string };
  history: { at: string; action: string; detail: string }[];
  research: Research[];
  composition: Composition;
}
export const categories: Record<Category, string> = {
  server: "서버",
  cpu: "CPU",
  memory: "메모리",
  ssd: "SSD",
  hdd: "HDD",
  nic: "NIC",
  hba: "HBA",
  raid: "RAID",
  os: "운영체제",
  cal: "CAL",
  psu: "전원",
  rack: "랙",
  support: "유지보수",
};
export const fieldLabels: Record<Field, string> = {
  model: "모델명",
  quantity: "수량",
  capacity_gb: "개별 용량 (GB)",
  clock_ghz: "기본 클럭 (GHz)",
  cores: "CPU당 물리 코어",
  ports: "포트 수",
  speed_gbps: "속도 (Gbps)",
  interface: "인터페이스",
  size_in: "폼팩터 (인치)",
  mount: "장착 형식",
  height: "카드 높이",
  rpm: "RPM",
  watts: "전력 (W)",
  raid_level: "RAID 레벨",
  license_cores: "OS 라이선스 코어",
  cal_count: "CAL 수량",
  cal_type: "CAL 종류",
  redundancy: "전원 이중화",
  rank: "메모리 랭크",
  memory_mts: "메모리 속도 (MT/s)",
  duration_months: "지원 기간 (개월)",
};
export const numericFields = new Set<Field>([
  "quantity",
  "capacity_gb",
  "clock_ghz",
  "cores",
  "ports",
  "speed_gbps",
  "size_in",
  "rpm",
  "watts",
  "license_cores",
  "cal_count",
  "memory_mts",
  "duration_months",
]);
export const visibleFields: Record<Category, Field[]> = {
  server: ["model", "quantity"],
  cpu: ["model", "quantity", "clock_ghz", "cores"],
  memory: [
    "model",
    "quantity",
    "capacity_gb",
    "interface",
    "memory_mts",
    "rank",
  ],
  ssd: [
    "model",
    "quantity",
    "capacity_gb",
    "interface",
    "size_in",
    "raid_level",
  ],
  hdd: [
    "model",
    "quantity",
    "capacity_gb",
    "interface",
    "size_in",
    "rpm",
    "raid_level",
  ],
  nic: ["model", "quantity", "ports", "speed_gbps", "mount", "height"],
  hba: ["model", "quantity", "ports", "speed_gbps", "mount", "height"],
  raid: ["model", "quantity", "raid_level"],
  os: ["model", "quantity", "license_cores", "cal_count"],
  cal: ["model", "cal_count", "cal_type"],
  psu: ["model", "quantity", "watts", "redundancy"],
  rack: ["model", "quantity"],
  support: ["model", "duration_months"],
};
export function fresh(): Draft {
  return {
    version: 2,
    step: 0,
    requirement: "",
    quote: "",
    data: null,
    policy: { cpu_core_scope: "unspecified", memory_scope: "unspecified" },
    history: [],
    research: [],
    composition: {
      model: "R760",
      view: "front",
      practice: false,
      images: {},
      boxes: { front: [], rear: [] },
      mappings: {},
      guides: true,
      snap: true,
      confirmed: { front: false, rear: false },
    },
  };
}
export function summary(it: Item) {
  const parts: string[] = [];
  for (const [f, unit] of [
    ["model", ""],
    ["clock_ghz", " GHz"],
    [
      "cores",
      it.issues.some((v) => v.includes("코어 수의"))
        ? "코어 이상 · 기준 확인"
        : "코어/CPU",
    ],
    ["capacity_gb", " GB"],
    ["interface", ""],
    ["ports", "포트"],
    ["speed_gbps", " Gb"],
    ["mount", ""],
    ["size_in", "인치"],
    ["rpm", " RPM"],
    ["license_cores", "코어 라이선스"],
    ["cal_count", " CAL"],
    ["cal_type", ""],
    ["watts", " W"],
    ["redundancy", " 이중화"],
    ["memory_mts", " MT/s"],
    ["duration_months", "개월"],
  ] as [Field, string][]) {
    if (it[f] != null) parts.push(String(it[f]) + unit);
  }
  if (it.raid_level != null) parts.push("RAID" + it.raid_level);
  return parts.join(" · ") || "세부 값 미명시";
}
export function quantities(it: Item) {
  if (it.quantity == null) return "수량 미명시";
  const qty = Number(it.quantity);
  return `수량 ${qty}개${it.category === "cpu" && it.cores != null ? " · 총 " + qty * Number(it.cores) + " 물리 코어" : it.category === "memory" && it.capacity_gb != null ? " · 총 " + qty * Number(it.capacity_gb) + " GB" : ""}`;
}
