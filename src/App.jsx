import { useEffect, useMemo, useState } from "react";
import {
  Activity, Droplets, Fan, Mountain, Siren, Thermometer, TriangleAlert, Wind, Zap, Droplet, Radio,
  LogIn, LogOut, History as HistoryIcon, X, ShieldCheck, UserRound, Home, ClipboardCheck,
} from "lucide-react";

/* ---------- Telemetri Firebase ---------- */
const ENDPOINT = "https://bionets-abaa9-default-rtdb.asia-southeast1.firebasedatabase.app/telemetry.json";
const POLL_MS = 2000;
const TIMEOUT_MS = 6000;
const OFFLINE_AFTER = 3; // gagal beruntun sebelum dianggap terputus
const STALE_AFTER_S = 30; // umur timestamp node sebelum data dianggap basi
const TANK_CAP = 5.5;

// Satu-satunya tempat pemetaan JSON -> UI. Jalur pertama tiap daftar dicoba lebih dulu.
// Terkonfirmasi: tangki.persen, sensor_udara.so2_ppm. Sisanya TEBAKAN, samakan dengan JSON Gemini.
const PATHS = {
  so2: ["sensor_udara.so2_ppm"],
  h2s: ["sensor_udara.h2s_ppm"],
  temp: ["sensor_udara.suhu_c", "sensor_udara.suhu", "lingkungan.suhu_c"],
  hum: ["sensor_udara.kelembapan_persen", "sensor_udara.kelembapan", "lingkungan.kelembapan_persen"],
  windFrom: ["angin.arah_derajat", "angin.arah"],
  windSpeed: ["angin.kecepatan_ms", "angin.kecepatan"],
  tankPct: ["tangki.persen"],
  pump: ["aktuator.pompa_misting", "aktuator.pompa"],
  solenoid: ["aktuator.solenoid"],
  blower: ["aktuator.blower"],
  ts: ["timestamp", "waktu"], // epoch milidetik; opsional, dipakai untuk deteksi data basi
};
const dig = (o, path) => path.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);
const first = (o, paths) => { for (const p of paths) { const v = dig(o, p); if (v !== undefined && v !== null) return v; } return null; };
const toNum = (v) => { const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : v; return Number.isFinite(n) ? n : null; };
const toBool = (v) => (v == null ? null : v === true || v === 1 || ["1", "ON", "AKTIF", "TRUE"].includes(String(v).toUpperCase()));

function mapTelemetry(raw) {
  const n = (k) => toNum(first(raw, PATHS[k]));
  const b = (k) => toBool(first(raw, PATHS[k]));
  return {
    so2: n("so2"), h2s: n("h2s"), temp: n("temp"), hum: n("hum"),
    windFrom: n("windFrom"), windSpeed: n("windSpeed"), tankPct: n("tankPct"),
    pump: b("pump"), solenoid: b("solenoid"), blower: b("blower"), ts: n("ts"),
  };
}

// Polling berurutan (setTimeout rekursif): tidak ada request menumpuk, berhenti saat tab tersembunyi.
function useTelemetry(enabled) {
  const [st, setSt] = useState({ raw: null, status: "loading", updatedAt: null, fails: 0, error: "" });
  useEffect(() => {
    if (!enabled) return;
    let alive = true, timer, ctrl;
    const tick = async () => {
      if (document.hidden) { timer = setTimeout(tick, POLL_MS); return; }
      ctrl = new AbortController();
      const killer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(ENDPOINT, { method: "GET", cache: "no-store", signal: ctrl.signal });
        if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? "Akses ditolak oleh aturan database (HTTP " + res.status + ")" : "HTTP " + res.status);
        const json = await res.json();
        if (json == null) throw new Error("Node /telemetry masih kosong");
        if (alive) setSt({ raw: json, status: "live", updatedAt: new Date(), fails: 0, error: "" });
      } catch (e) {
        const msg = e.name === "AbortError" ? "Waktu tunggu habis" : e.message || "Gagal terhubung";
        if (alive) setSt((p) => ({ ...p, fails: p.fails + 1, status: p.fails + 1 >= OFFLINE_AFTER ? "offline" : "retrying", error: msg }));
      } finally {
        clearTimeout(killer);
        if (alive) timer = setTimeout(tick, POLL_MS);
      }
    };
    tick();
    return () => { alive = false; clearTimeout(timer); ctrl && ctrl.abort(); };
  }, [enabled]);
  return st;
}

const fmt1 = (v) => (v == null ? "--" : v.toFixed(1).replace(".", ","));
const pctOf = (v, max) => (v == null ? 0 : Math.min(Math.max((v / max) * 100, 0), 100));
const bearingOf = (d) => (d.windFrom == null ? null : (d.windFrom + 180) % 360);
const clockOf = (dt) => (dt ? dt.toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour12: false }).replace(/\./g, ":") : "-");

// Ambang di bawah hanya placeholder visual; sesuaikan dengan standar BPBD/PVMBG.
const LIMITS = { so2: { warn: 2, danger: 5, max: 10 }, h2s: { warn: 1, danger: 5, max: 10 } };

const TONE = {
  safe: { hex: "#22d3ee", text: "text-cyan-300", label: "Aman" },
  warn: { hex: "#facc15", text: "text-yellow-400", label: "Waspada" },
  danger: { hex: "#ef4444", text: "text-red-400", label: "Bahaya" },
};
const level = (v, { warn, danger }) => (v >= danger ? "danger" : v >= warn ? "warn" : "safe");
const compass = (d) => ["Utara", "Timur Laut", "Timur", "Tenggara", "Selatan", "Barat Daya", "Barat", "Barat Laut"][Math.round(d / 45) % 8];

const CHAMFER = (n) =>
  `polygon(0 0, calc(100% - ${n}px) 0, 100% ${n}px, 100% 100%, ${n}px 100%, 0 calc(100% - ${n}px))`;

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
.bn-root{font-family:'IBM Plex Sans',ui-sans-serif,system-ui,sans-serif}
.bn-display{font-family:'Barlow Condensed','Arial Narrow',ui-sans-serif,sans-serif;font-variant-numeric:tabular-nums}
@keyframes bn-sweep{to{transform:rotate(360deg)}}
@keyframes bn-ping{0%{transform:scale(.15);opacity:.9}100%{transform:scale(1);opacity:0}}
.bn-sweep{transform-origin:200px 200px;transform-box:view-box;animation:bn-sweep 6s linear infinite}
.bn-ping{transform-box:fill-box;transform-origin:center;animation:bn-ping 3.6s ease-out infinite}
@keyframes bn-scan{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}
.bn-scan{animation:bn-scan 1.4s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){.bn-sweep,.bn-ping,.bn-scan{animation:none}.bn-ping{opacity:.25}}
`;

/* ---------- Primitif ---------- */
function Panel({ title, aside, className = "", children }) {
  return (
    <section className={`p-px bg-slate-700/70 ${className}`} style={{ clipPath: CHAMFER(16) }}>
      <div className="h-full bg-gray-900 p-4 sm:p-5" style={{ clipPath: CHAMFER(15) }}>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="bn-display text-lg font-semibold tracking-wide text-slate-200">{title}</h2>
          {aside}
        </div>
        {children}
      </div>
    </section>
  );
}

function ArcGauge({ value, label, unit, limits }) {
  const has = value != null;
  const lvl = has ? level(value, limits) : null;
  const hex = has ? TONE[lvl].hex : "#475569";
  const f = has ? Math.min(Math.max(value / limits.max, 0), 1) : 0;
  const tick = (v) => {
    const a = Math.PI * (1 - v / limits.max);
    const p = (r) => [100 + r * Math.cos(a), 100 - r * Math.sin(a)];
    const [x1, y1] = p(72), [x2, y2] = p(90);
    return <line key={v} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#94a3b8" strokeWidth="1.5" />;
  };
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-300">{label}</span>
        <span className={`text-sm font-medium ${has ? TONE[lvl].text : "text-slate-500"}`}>{has ? TONE[lvl].label : "Tidak ada data"}</span>
      </div>
      <svg viewBox="0 0 200 118" className="w-full" role="img" aria-label={has ? `${label} ${value} ${unit}, status ${TONE[lvl].label}` : `${label}: data tidak tersedia`}>
        <path d="M20 100 A80 80 0 0 1 180 100" pathLength="100" fill="none" stroke="#1e293b" strokeWidth="12" />
        <path d="M20 100 A80 80 0 0 1 180 100" pathLength="100" fill="none" stroke={hex}
          strokeWidth="12" strokeDasharray={`${f * 100} 100`} style={{ filter: has ? `drop-shadow(0 0 6px ${hex}88)` : undefined, transition: "stroke-dasharray .6s ease" }} />
        {[limits.warn, limits.danger].map(tick)}
        <text x="100" y="94" textAnchor="middle" fill={has ? "#f8fafc" : "#64748b"} className="bn-display" fontSize="44" fontWeight="600">
          {has ? value.toFixed(1) : "--"}
        </text>
        <text x="100" y="114" textAnchor="middle" fill="#94a3b8" fontSize="12">{unit}</text>
      </svg>
    </div>
  );
}

function Metric({ icon: Icon, label, value, unit, pct }) {
  return (
    <div className="bg-slate-800/50 p-3">
      <div className="flex items-center gap-2 text-slate-400 text-sm"><Icon size={16} />{label}</div>
      <div className="bn-display text-4xl font-semibold text-slate-100 mt-1">
        {value ?? "--"}<span className="text-lg text-slate-400 ml-1">{unit}</span>
      </div>
      <div className="h-1 bg-slate-700 mt-2"><div className="h-1 bg-cyan-400" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

/* ---------- Radar + kompas ---------- */
function WindCompass({ from, speed }) {
  const ticks = Array.from({ length: 72 }, (_, i) => i * 5);
  const has = from != null;
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 220 220" className="w-44 sm:w-52 shrink-0" role="img" aria-label={has ? `Angin dari ${from} derajat ${compass(from)}, ${speed ?? "--"} meter per detik` : "Data arah angin tidak tersedia"}>
        <circle cx="110" cy="110" r="100" fill="#0b1118" stroke="#334155" strokeWidth="1.5" />
        {ticks.map((t) => (
          <line key={t} x1="110" y1="12" x2="110" y2={t % 45 === 0 ? 26 : t % 15 === 0 ? 21 : 17}
            stroke={t % 90 === 0 ? "#facc15" : "#64748b"} strokeWidth={t % 45 === 0 ? 2 : 1} transform={`rotate(${t} 110 110)`} />
        ))}
        {[["U", 0], ["T", 90], ["S", 180], ["B", 270]].map(([l, a]) => {
          const r = 44, x = 110 + r * Math.sin((a * Math.PI) / 180) * (62 / 44), y = 110 - r * Math.cos((a * Math.PI) / 180) * (62 / 44);
          return <text key={l} x={x} y={y + 5} textAnchor="middle" fill={l === "U" ? "#f87171" : "#cbd5e1"} fontSize="15" fontWeight="600" className="bn-display">{l}</text>;
        })}
        {/* jarum: ekor di sisi asal angin, kepala ke arah tiupan */}
        {has && <g transform={`rotate(${from + 180} 110 110)`}>
          <path d="M110 34 L120 110 L110 100 L100 110 Z" fill="#facc15" />
          <path d="M110 186 L116 110 L104 110 Z" fill="#475569" />
        </g>}
        <circle cx="110" cy="110" r="6" fill="#0b1118" stroke="#facc15" strokeWidth="2" />
      </svg>
      <div>
        <div className="bn-display text-5xl font-semibold text-slate-100 leading-none">{has ? `${from}°` : "--"}</div>
        <div className="text-slate-300 mt-1">{has ? `dari ${compass(from)}` : "Arah tidak tersedia"}</div>
        <div className="bn-display text-3xl text-yellow-400 mt-3 leading-none">{speed ?? "--"}<span className="text-base text-slate-400 ml-1">m/s</span></div>
        <div className="text-xs text-slate-500 mt-2">{has ? `Tiupan menuju ${Math.round((from + 180) % 360)}°` : "Menunggu data angin"}</div>
      </div>
    </div>
  );
}

function SpatialRadar({ bearing }) {
  return (
    <div className="relative">
      <svg viewBox="0 0 400 400" className="w-full max-h-96 mx-auto" role="img" aria-label="Peta sebaran gas, simulasi arah tiupan menuju Sempol">
        <defs>
          <radialGradient id="bn-plume" cx="50%" cy="100%" r="100%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity=".55" />
            <stop offset="45%" stopColor="#facc15" stopOpacity=".32" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="bn-sweepfill" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity=".28" />
          </linearGradient>
          <clipPath id="bn-disc"><circle cx="200" cy="200" r="184" /></clipPath>
        </defs>
        <circle cx="200" cy="200" r="184" fill="#080d13" />
        <g clipPath="url(#bn-disc)">
          {/* grid */}
          {Array.from({ length: 9 }, (_, i) => (
            <g key={i} stroke="#162231" strokeWidth="1">
              <line x1={i * 50} y1="0" x2={i * 50} y2="400" /><line x1="0" y1={i * 50} x2="400" y2={i * 50} />
            </g>
          ))}
          {/* plume mengikuti arah tiupan */}
          {bearing != null && <g transform={`rotate(${bearing} 200 200)`}>
            <path d="M200 200 L150 30 Q200 4 250 30 Z" fill="url(#bn-plume)" />
            <circle cx="200" cy="96" r="34" fill="#facc15" opacity=".14" />
            <circle cx="200" cy="140" r="20" fill="#ef4444" opacity=".2" />
            <g transform="rotate(0)">
              <circle cx="200" cy="52" r="5" fill="#f8fafc" />
              <circle className="bn-ping" cx="200" cy="52" r="22" fill="none" stroke="#facc15" strokeWidth="2" />
              <g transform={`rotate(${-bearing} 200 52)`}>
                <text x="214" y="48" fill="#f8fafc" fontSize="14" fontWeight="600">Sempol</text>
              </g>
            </g>
          </g>}
          {/* sapuan radar */}
          <g className="bn-sweep"><path d="M200 200 L200 16 A184 184 0 0 1 330 70 Z" fill="url(#bn-sweepfill)" /></g>
        </g>
        {[46, 92, 138, 184].map((r) => (
          <circle key={r} cx="200" cy="200" r={r} fill="none" stroke="#2b3a4d" strokeWidth="1" strokeDasharray={r === 184 ? "0" : "3 5"} />
        ))}
        {/* node sumber */}
        <circle className="bn-ping" cx="200" cy="200" r="40" fill="none" stroke="#22d3ee" strokeWidth="2" />
        <circle cx="200" cy="200" r="6" fill="#22d3ee" />
        <text x="212" y="222" fill="#94a3b8" fontSize="12">Node ESP32</text>
        <text x="200" y="14" textAnchor="middle" fill="#f87171" fontSize="12" fontWeight="600">U</text>
      </svg>
      <div className="flex items-center gap-3 mt-3 text-xs text-slate-400">
        <span>Rendah</span>
        <div className="h-1.5 flex-1" style={{ background: "linear-gradient(90deg,#22d3ee,#facc15,#ef4444)" }} />
        <span>Tinggi</span>
        <span className="text-slate-500 ml-2">Placeholder, belum terhubung data spasial</span>
      </div>
    </div>
  );
}

/* ---------- Infrastruktur ---------- */
function Tank({ pct, cap }) {
  const v = pct ?? 0;
  const hex = pct == null ? "#475569" : v > 30 ? "#22d3ee" : v > 15 ? "#facc15" : "#ef4444";
  return (
    <div className="flex items-end gap-5">
      <div className="relative w-20 h-56 border border-slate-600 bg-slate-950/80">
        <div className="absolute bottom-0 inset-x-0 transition-all duration-700"
          style={{ height: `${v}%`, background: `linear-gradient(180deg, ${hex}, ${hex}66)`, boxShadow: `0 0 18px ${hex}55` }} />
        {[25, 50, 75].map((m) => (
          <div key={m} className="absolute inset-x-0 border-t border-slate-500/70" style={{ bottom: `${m}%` }}>
            <span className="absolute left-full ml-2 -translate-y-1/2 text-xs text-slate-500">{m}%</span>
          </div>
        ))}
      </div>
      <div className="pb-1">
        <div className="bn-display text-6xl font-semibold text-slate-100 leading-none">{pct ?? "--"}<span className="text-2xl text-slate-400">%</span></div>
        <div className="text-slate-300 mt-2">{pct == null ? "--" : ((pct / 100) * cap).toFixed(2).replace(".", ",")} L dari {cap} L</div>
        <div className="text-xs text-slate-500 mt-1">Cairan eco-alkaline</div>
      </div>
    </div>
  );
}

function Actuator({ icon: Icon, name, on, onText = "Aktif", offText = "Mati" }) {
  return (
    <div className={`flex items-center gap-3 p-3 border-l-4 ${on ? "border-cyan-400 bg-cyan-400/10" : "border-slate-600 bg-slate-800/40"}`}>
      <Icon size={22} className={on ? "text-cyan-300" : "text-slate-500"} />
      <div className="flex-1">
        <div className="text-slate-100 text-sm font-medium">{name}</div>
        <div className={`text-xs ${on ? "text-cyan-300" : "text-slate-500"}`}>{on ? onText : offText}</div>
      </div>
      <span className={`w-3 h-3 rounded-full ${on ? "bg-cyan-400" : "bg-slate-600"}`} style={on ? { boxShadow: "0 0 10px #22d3ee" } : undefined} />
    </div>
  );
}

function OverrideButton({ state, setState }) {
  useEffect(() => {
    if (state !== "armed") return;
    const t = setTimeout(() => setState("idle"), 4000);
    return () => clearTimeout(t);
  }, [state, setState]);
  const hazard = { background: "repeating-linear-gradient(135deg,#facc15 0 12px,#0b0e12 12px 24px)" };
  if (state === "engaged") {
    return (
      <div className="border border-red-500 bg-red-500/10 p-4 text-center">
        <div className="bn-display text-2xl font-semibold text-red-400">MANUAL OVERRIDE AKTIF</div>
        <button onClick={() => setState("idle")} className="mt-3 px-4 py-2 text-sm border border-slate-500 text-slate-200 hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400">
          Kembalikan ke mode otomatis
        </button>
      </div>
    );
  }
  const armed = state === "armed";
  return (
    <div>
      <div className="h-2" style={hazard} />
      <button
        onClick={() => setState(armed ? "engaged" : "armed")}
        className={`w-full px-4 py-5 flex items-center justify-center gap-3 font-bold text-lg leading-tight transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-yellow-300 ${armed ? "bg-yellow-400 text-gray-950" : "bg-red-600 hover:bg-red-500 text-white"}`}
      >
        <Siren size={26} className="shrink-0" />
        <span className="bn-display text-xl tracking-wide">{armed ? "TEKAN SEKALI LAGI UNTUK KONFIRMASI" : "ACTIVATE MIST CANNON (MANUAL OVERRIDE)"}</span>
      </button>
      <div className="h-2" style={hazard} />
    </div>
  );
}

/* ---------- RBAC: peran & data contoh ---------- */
const ROLES = {
  admin: { label: "Admin BPBD", badge: "Admin", cls: "border-yellow-400/60 text-yellow-300 bg-yellow-400/10" },
  citizen: { label: "Warga", badge: "Warga", cls: "border-cyan-400/60 text-cyan-300 bg-cyan-400/10" },
};
const ORDER = ["safe", "warn", "danger"];
const overall = (d) => {
  const lv = [d.so2 != null && level(d.so2, LIMITS.so2), d.h2s != null && level(d.h2s, LIMITS.h2s)].filter(Boolean);
  if (!lv.length) return "warn"; // tanpa data gas, status dijaga di Waspada
  return lv.sort((a, b) => ORDER.indexOf(b) - ORDER.indexOf(a))[0];
};

// Data riwayat statis (contoh)
const ADMIN_LOG = [
  { t: "09:58", ev: "Pompa misting mati", src: "Otomatis, SO₂ turun di bawah 4 ppm", on: false },
  { t: "09:42", ev: "Pompa misting aktif", src: "Manual override oleh Admin BPBD", on: true },
  { t: "09:41", ev: "Solenoid valve terbuka", src: "Manual override oleh Admin BPBD", on: true },
  { t: "08:15", ev: "Blower fan aktif", src: "Otomatis, SO₂ melewati 2 ppm", on: true },
];
const CITIZEN_LOG = [
  { t: "09:42", so2: 5.1 }, { t: "12:25", so2: 4.6 }, { t: "06:10", so2: 3.8 }, { t: "15:03", so2: 2.9 },
];

const SCALE = {
  safe: { hex: "#34d399", text: "text-emerald-300", label: "Aman", Icon: ShieldCheck },
  warn: { hex: "#facc15", text: "text-yellow-400", label: "Waspada", Icon: TriangleAlert },
  danger: { hex: "#ef4444", text: "text-red-400", label: "Bahaya", Icon: Siren },
};
// Teks Madura = draf, wajib diverifikasi penutur asli sebelum dipakai di lapangan.
const t = (mad, id) => ({ mad, id });
const ADVICE = {
  safe: {
    headline: t("Kaadaan aman, nambang bisa ajâlân biasa", "Kondisi aman, penambangan dapat berjalan normal"),
    petani: [
      t("Nambang bisa ajâlân biasa.", "Penambangan boleh berjalan normal."),
      t("Tetep ghibâ masker gas ban cèk status sering.", "Tetap bawa masker gas dan cek status secara berkala."),
    ],
    warga: [
      t("Ta' bâdhâ tindakan khusus.", "Tidak ada tindakan khusus."),
      t("Cèk halaman reya mon bâu belerang tambâ' sangat.", "Pantau halaman ini bila bau belerang menguat."),
    ],
  },
  warn: {
    headline: t("Waspada, kurangè kagiatan è kawah", "Waspada, batasi aktivitas di sekitar kawah"),
    petani: [
      t("Pakè masker gas sè bâdhâ filter-na, ajhâ' alama è kawah.", "Pakai masker gas berfilter, jangan lama-lama di kawah."),
      t("Ajhâ' è cèkungan, sabâb gas belerang atompok è dhâ'.", "Jangan di cekungan atau lembah, karena gas belerang menumpuk di bawah."),
      t("Nambang bârèng-bârèng, ajhâ' dhibi'.", "Menambang berkelompok, jangan sendirian."),
    ],
    warga: [
      t("Totop lawang ban jendhèla. Arah gas ajâlân ka Sempol.", "Tutup pintu dan jendela. Arah gas menuju Sempol."),
      t("Ana' kènè', oréng towa, ban sè sakèt sesek tetep è dhâlem roma.", "Anak kecil, lansia, dan penderita sesak napas sebaiknya tetap di dalam rumah."),
      t("Siap-siap masker.", "Siapkan masker."),
    ],
  },
  danger: {
    headline: t("Bâhaya, jhâu dâri kawah mangkèn", "Bahaya, segera menjauh dari kawah"),
    petani: [
      t("Mandhek nambang ban toron mangkèn.", "Hentikan penambangan dan turun sekarang."),
      t("Ajâlân tegak lurus ka arah angin, ajhâ' sa-arah ban gas.", "Bergerak tegak lurus terhadap arah angin, jangan searah gas."),
      t("Ngèkot parèntah petugas BPBD è jâlân evakuasi.", "Ikuti arahan petugas BPBD di jalur evakuasi."),
    ],
    warga: [
      t("Totop rapet lawang ban jendhèla, ban siap-siap evakuasi.", "Tutup rapat pintu dan jendela, lalu bersiap evakuasi."),
      t("Ngèkot parèntah aparat dhisa ban BPBD.", "Ikuti instruksi aparat desa dan BPBD."),
      t("Ghibâ masker, dokumen penting, ban obat pribadi.", "Bawa masker, dokumen penting, dan obat pribadi."),
    ],
  },
};
const REKOMENDASI = {
  safe: "Kondisi terkendali. Lanjutkan pemantauan rutin.",
  warn: `Siapkan mist cannon dan pastikan cairan mencukupi. Aktifkan manual bila SO₂ mencapai ${LIMITS.so2.danger} ppm. Informasikan petani belerang dan warga Sempol.`,
  danger: "Aktifkan mist cannon sekarang, keluarkan instruksi evakuasi, dan koordinasikan dengan PVMBG serta aparat desa.",
};

const Footer = () => (
  <footer className="border-t border-slate-800 py-4 px-4 text-center text-xs text-slate-500">
    © 2026 BIO-NETS - SMAN 2 Bondowoso. All Rights Reserved.
  </footer>
);

/* ---------- Login ---------- */
function LoginPage({ onLogin }) {
  const [role, setRole] = useState("admin");
  const [username, setUsername] = useState("");
  const submit = (e) => {
    e.preventDefault();
    onLogin({ role, name: ROLES[role].label, username: username || (role === "admin" ? "admin.bpbd" : "warga") });
  };
  const field = "w-full bg-slate-950 border border-slate-600 px-3 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-yellow-400 focus-visible:ring-2 focus-visible:ring-yellow-400/60";
  return (
    <div className="bn-root min-h-screen bg-gray-950 text-slate-200 flex flex-col">
      <style>{CSS}</style>
      <main className="flex-1 grid place-items-center p-4">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 mb-6">
            <Mountain size={34} className="text-yellow-400" />
            <div>
              <h1 className="bn-display text-2xl font-bold tracking-wide text-slate-50">BIO-NETS Command Center</h1>
              <p className="text-sm text-slate-400">Sektor Ijen/Sempol</p>
            </div>
          </div>
          <Panel title="Masuk">
            <form onSubmit={submit} className="space-y-4">
              <div>
                <div className="text-sm text-slate-300 mb-2" id="bn-role">Masuk sebagai</div>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="bn-role">
                  {Object.entries(ROLES).map(([k, r]) => (
                    <button key={k} type="button" role="radio" aria-checked={role === k} onClick={() => setRole(k)}
                      className={`py-2 text-sm font-medium border focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 ${role === k ? r.cls : "border-slate-600 text-slate-400 hover:text-slate-200"}`}>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block text-sm text-slate-300">Nama pengguna
                <input className={`${field} mt-1`} value={username} onChange={(e) => setUsername(e.target.value)} placeholder={role === "admin" ? "admin.bpbd" : "warga"} autoComplete="username" />
              </label>
              <label className="block text-sm text-slate-300">Kata sandi
                <input type="password" className={`${field} mt-1`} placeholder="••••••••" autoComplete="current-password" />
              </label>
              <button type="submit" className="w-full flex items-center justify-center gap-2 py-3 bg-yellow-400 hover:bg-yellow-300 text-gray-950 font-semibold focus:outline-none focus-visible:ring-4 focus-visible:ring-yellow-200">
                <LogIn size={18} /> Masuk
              </button>
              <p className="text-xs text-slate-500">Mockup: validasi peran sebenarnya dilakukan di sisi server.</p>
            </form>
          </Panel>
        </div>
      </main>
      <Footer />
    </div>
  );
}

/* ---------- Header: profil & riwayat ---------- */
function Profile({ user, onLogout }) {
  const r = ROLES[user.role];
  return (
    <div className="flex items-center gap-3 pl-4 border-l border-slate-700">
      <span className="grid place-items-center w-9 h-9 rounded-full bg-slate-800 border border-slate-600"><UserRound size={18} className="text-slate-300" /></span>
      <div className="leading-tight">
        <div className="text-sm font-medium text-slate-100">{user.name}</div>
        <span className={`inline-block mt-0.5 px-1.5 text-xs border ${r.cls}`}>{r.badge}</span>
      </div>
      <button onClick={onLogout} aria-label="Keluar" title="Keluar" className="p-2 text-slate-400 hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400">
        <LogOut size={18} />
      </button>
    </div>
  );
}

function HistoryDrawer({ role, onClose }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  const admin = role === "admin";
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Riwayat kejadian">
      <button className="flex-1 bg-black/60" onClick={onClose} aria-label="Tutup riwayat" tabIndex={-1} />
      <aside className="w-full sm:w-96 bg-gray-900 border-l border-slate-700 p-5 overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="bn-display text-2xl font-semibold text-slate-50">Riwayat kejadian</h2>
          <button onClick={onClose} aria-label="Tutup" className="p-1 text-slate-400 hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"><X size={20} /></button>
        </div>
        <p className="text-sm text-slate-400 mb-4">{admin ? "Aktuator yang menyala hari ini" : "Kualitas udara terburuk hari ini (SO₂)"}</p>
        <ul className="space-y-2">
          {admin
            ? ADMIN_LOG.map((e) => (
                <li key={e.t + e.ev} className={`p-3 border-l-4 ${e.on ? "border-cyan-400 bg-cyan-400/10" : "border-slate-600 bg-slate-800/40"}`}>
                  <div className="flex justify-between text-sm"><span className="font-medium text-slate-100">{e.ev}</span><span className="bn-display text-lg text-slate-300">{e.t}</span></div>
                  <div className="text-xs text-slate-400 mt-0.5">{e.src}</div>
                </li>
              ))
            : CITIZEN_LOG.map((e) => {
                const s = SCALE[level(e.so2, LIMITS.so2)];
                return (
                  <li key={e.t} className="p-3 border-l-4 bg-slate-800/40 flex items-center justify-between" style={{ borderColor: s.hex }}>
                    <div><div className={`text-sm font-medium ${s.text}`}>{s.label}</div><div className="text-xs text-slate-400">Pukul {e.t} WIB</div></div>
                    <div className="bn-display text-3xl text-slate-100">{e.so2.toFixed(1).replace(".", ",")}<span className="text-sm text-slate-400 ml-1">ppm</span></div>
                  </li>
                );
              })}
        </ul>
        <p className="text-xs text-slate-500 mt-4">Data contoh untuk mockup.</p>
      </aside>
    </div>
  );
}

const CONN = {
  connecting: { txt: "Menghubungkan", box: "border-slate-500/50 bg-slate-500/10", dot: "bg-slate-400", tx: "text-slate-300" },
  online: { txt: "Node Online", box: "border-cyan-400/50 bg-cyan-400/10", dot: "bg-cyan-400", tx: "text-cyan-200" },
  retrying: { txt: "Mencoba lagi", box: "border-yellow-400/50 bg-yellow-400/10", dot: "bg-yellow-400", tx: "text-yellow-200" },
  stale: { txt: "Data basi", box: "border-yellow-400/50 bg-yellow-400/10", dot: "bg-yellow-400", tx: "text-yellow-200" },
  offline: { txt: "Terputus", box: "border-red-500/60 bg-red-500/10", dot: "bg-red-500", tx: "text-red-300" },
};

function LoadingScreen({ status, error }) {
  const failing = status === "retrying" || status === "offline";
  return (
    <main className="grid place-items-center p-6" style={{ minHeight: "60vh" }} role="status" aria-busy="true">
      <div className="w-full max-w-sm text-center">
        <svg viewBox="0 0 400 400" className="w-56 mx-auto" aria-hidden="true">
          <defs>
            <linearGradient id="bn-loadfill" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={failing ? "#facc15" : "#22d3ee"} stopOpacity="0" />
              <stop offset="100%" stopColor={failing ? "#facc15" : "#22d3ee"} stopOpacity=".3" />
            </linearGradient>
          </defs>
          <circle cx="200" cy="200" r="184" fill="#080d13" stroke="#334155" strokeWidth="2" />
          {[46, 92, 138].map((r) => <circle key={r} cx="200" cy="200" r={r} fill="none" stroke="#2b3a4d" strokeDasharray="3 5" />)}
          <g className="bn-sweep"><path d="M200 200 L200 16 A184 184 0 0 1 330 70 Z" fill="url(#bn-loadfill)" /></g>
          <circle className="bn-ping" cx="200" cy="200" r="70" fill="none" stroke={failing ? "#facc15" : "#22d3ee"} strokeWidth="2" />
          <circle cx="200" cy="200" r="6" fill={failing ? "#facc15" : "#22d3ee"} />
        </svg>
        <h2 className="bn-display text-2xl font-semibold text-slate-50 mt-5">{failing ? "Belum ada balasan dari database" : "Menghubungkan ke node Ijen"}</h2>
        <p className="text-sm text-slate-400 mt-1">{failing ? `${error}. Mencoba lagi otomatis tiap 2 detik.` : "Menunggu telemetri pertama dari Firebase."}</p>
        <div className="relative h-1 bg-slate-800 mt-5 overflow-hidden"><div className={`bn-scan absolute inset-y-0 w-2/5 ${failing ? "bg-yellow-400" : "bg-cyan-400"}`} /></div>
      </div>
    </main>
  );
}

function Shell({ user, onLogout, conn, children }) {
  const [now, setNow] = useState(new Date());
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const clock = now.toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour12: false }).replace(/\./g, ":");
  const date = now.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="bn-root min-h-screen bg-gray-950 text-slate-200 flex flex-col">
      <style>{CSS}</style>
      <header className="bg-slate-900 border-b border-slate-700">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Mountain size={30} className="text-yellow-400 shrink-0" />
            <h1 className="bn-display text-lg sm:text-2xl font-bold tracking-wide text-slate-50">BIO-NETS COMMAND CENTER - SEKTOR IJEN/SEMPOL</h1>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="text-right">
              <div className="bn-display text-3xl font-semibold text-slate-50 leading-none">{clock} <span className="text-sm text-slate-400">WIB</span></div>
              <div className="text-xs text-slate-400 mt-1">{date}</div>
            </div>
            <div className={`flex items-center gap-2 px-3 py-1.5 border ${CONN[conn.status].box}`}>
              <span className="relative flex w-2.5 h-2.5">
                {conn.status === "online" && <span className="absolute inline-flex w-full h-full rounded-full bg-cyan-400 opacity-60 animate-ping motion-reduce:animate-none" />}
                <span className={`relative inline-flex w-2.5 h-2.5 rounded-full ${CONN[conn.status].dot}`} />
              </span>
              <Radio size={16} className={CONN[conn.status].tx} /><span className={`text-sm font-medium ${CONN[conn.status].tx}`}>{CONN[conn.status].txt}</span>
            </div>
            <button onClick={() => setHistoryOpen(true)} className="flex items-center gap-2 px-3 py-1.5 border border-slate-600 text-sm text-slate-200 hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400">
              <HistoryIcon size={16} /> Riwayat
            </button>
            <Profile user={user} onLogout={onLogout} />
          </div>
        </div>
      </header>
      {conn.hasData && (conn.status === "offline" || conn.status === "stale") && (
        <div className={`border-b ${conn.status === "offline" ? "bg-red-500/10 border-red-500/40 text-red-200" : "bg-yellow-400/10 border-yellow-400/40 text-yellow-200"}`}>
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-2 text-sm">
            <TriangleAlert size={16} className="shrink-0" />
            {conn.status === "offline"
              ? `Koneksi ke database terputus. Menampilkan data terakhir pukul ${conn.lastTime} WIB.`
              : `Node tidak mengirim data baru selama ${conn.ageSec} detik. Nilai di layar mungkin sudah tidak berlaku.`}
          </div>
        </div>
      )}
      <div className="flex-1">{children}</div>
      <Footer />
      {historyOpen && <HistoryDrawer role={user.role} onClose={() => setHistoryOpen(false)} />}
    </div>
  );
}

/* ---------- AdminView ---------- */
function Stat({ label, value, note, color }) {
  return (
    <div className="bg-slate-800/50 p-3 border-l-4" style={{ borderColor: color }}>
      <div className="text-sm text-slate-400">{label}</div>
      <div className="bn-display text-3xl font-semibold text-slate-100 leading-tight">{value}</div>
      <div className="text-xs text-slate-500">{note}</div>
    </div>
  );
}

function AdminView({ d }) {
  const [override, setOverride] = useState("idle");
  // FUNGSI BARU: Mengubah tampilan UI dan melakukan HTTP PATCH ke Firebase
  const handleOverride = async (newState) => {
    setOverride(newState); // Mengubah visual tombol
    const isActive = newState === "engaged";
    try {
      await fetch("https://bionets-abaa9-default-rtdb.asia-southeast1.firebasedatabase.app/kontrol.json", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manual_aktif: isActive })
      });
      console.log("Perintah dikirim ke Firebase. manual_aktif:", isActive);
    } catch (err) {
      console.error("Gagal mengirim perintah ke Firebase:", err);
    }
  };

  const bearing = bearingOf(d);
  const lvl = overall(d);
  const s = SCALE[lvl];
  const litres = d.tankPct == null ? "--" : ((d.tankPct / 100) * TANK_CAP).toFixed(2).replace(".", ",");
  return (
    <main className="max-w-screen-2xl mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
      <Panel title="Kesimpulan dan overview status" className="lg:col-span-12" aside={<ClipboardCheck size={18} className="text-slate-500" />}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Status keseluruhan" value={s.label} note="Ditentukan gas tertinggi" color={s.hex} />
          <Stat label="SO₂ saat ini" value={`${fmt1(d.so2)} ppm`} note={`Ambang bahaya ${LIMITS.so2.danger} ppm`} color={d.so2 == null ? "#64748b" : TONE[level(d.so2, LIMITS.so2)].hex} />
          <Stat label="Cairan tersisa" value={`${litres} L`} note={`${d.tankPct ?? "--"}% dari ${TANK_CAP} L`} color={d.tankPct == null ? "#64748b" : d.tankPct > 30 ? "#22d3ee" : "#facc15"} />
          <Stat label="Mode aktuator" value={override === "engaged" ? "Manual" : "Otomatis"} note={bearing == null ? "Arah angin tidak tersedia" : `Tiupan menuju ${bearing}° (${compass(bearing)})`} color={override === "engaged" ? "#ef4444" : "#22d3ee"} />
        </div>
        <p className="mt-4 text-slate-200">
          <span className="font-semibold text-slate-50">Rekomendasi: </span>{REKOMENDASI[lvl]}
          {d.tankPct != null && d.tankPct < 30 && " Cadangan cairan menipis, rencanakan pengisian ulang."}
        </p>
      </Panel>
      <div className="lg:col-span-3 flex flex-col gap-4 sm:gap-6">
        <Panel title="Kualitas udara" aside={<Activity size={18} className="text-slate-500" />}>
          <ArcGauge value={d.so2} label="Sulfur dioksida (SO₂)" unit="ppm" limits={LIMITS.so2} />
          <div className="h-px bg-slate-800 my-4" />
          <ArcGauge value={d.h2s} label="Hidrogen sulfida (H₂S)" unit="ppm" limits={LIMITS.h2s} />
        </Panel>
        <Panel title="Kondisi lingkungan">
          <div className="grid grid-cols-2 gap-3">
            <Metric icon={Thermometer} label="Suhu" value={d.temp} unit="°C" pct={pctOf(d.temp, 50)} />
            <Metric icon={Droplet} label="Kelembapan" value={d.hum} unit="%" pct={pctOf(d.hum, 100)} />
          </div>
        </Panel>
      </div>
      <div className="lg:col-span-6 flex flex-col gap-4 sm:gap-6">
        <Panel title="Angin" aside={<Wind size={18} className="text-slate-500" />}><WindCompass from={d.windFrom} speed={d.windSpeed} /></Panel>
        <Panel title="Sebaran gas"><SpatialRadar bearing={bearing} /></Panel>
      </div>
      <div className="lg:col-span-3 flex flex-col gap-4 sm:gap-6">
        <Panel title="Tangki eco-alkaline 5,5 L"><Tank pct={d.tankPct} cap={TANK_CAP} /></Panel>
        <Panel title="Status aktuator">
          <div className="flex flex-col gap-3">
            <Actuator icon={Droplets} name="Pompa misting (mist cannon)" on={d.pump ?? override === "engaged"} offText="Siaga" />
            <Actuator icon={Zap} name="Solenoid valve" on={d.solenoid ?? override === "engaged"} onText="Terbuka" offText="Tertutup" />
            <Actuator icon={Fan} name="Blower fan" on={!!d.blower} offText="Mati" />
          </div>
        </Panel>
        {/* BAGIAN YANG DIUBAH: Memanggil handleOverride */}
        <Panel title="Kendali manual"><OverrideButton state={override} setState={handleOverride} /></Panel>
      </div>
    </main>
  );
}

/* ---------- CitizenView ---------- */
function CitizenStatus({ d }) {
  const lvl = overall(d);
  const s = SCALE[lvl];
  const a = ADVICE[lvl];
  const Block = ({ title, items, icon: Icon }) => (
    <div>
      <h3 className="flex items-center gap-2 font-semibold text-slate-100 mb-2"><Icon size={18} className="text-slate-400" />{title}</h3>
      <ul className="space-y-2 text-slate-200">
        {items.map((i) => (
          <li key={i.id} className="pl-3 border-l-2 border-slate-600">
            <div lang="mad" className="font-medium text-slate-100">{i.mad}</div>
            <div lang="id" className="text-sm text-slate-400">{i.id}</div>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <Panel title="Status keamanan" aside={<ShieldCheck size={18} className="text-slate-500" />}>
      <div className="p-5 mb-4 border" style={{ borderColor: s.hex, background: `${s.hex}1a` }}>
        <div className="flex items-center gap-4">
          <s.Icon size={52} style={{ color: s.hex }} className="shrink-0" />
          <div>
            <div className={`bn-display text-6xl font-bold leading-none ${s.text}`}>{s.label}</div>
            <div lang="mad" className="font-medium text-slate-50 mt-2">{a.headline.mad}</div>
            <div lang="id" className="text-sm text-slate-300">{a.headline.id}</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1 mt-4" aria-hidden="true">
          {ORDER.map((k) => <div key={k} className="h-2" style={{ background: SCALE[k].hex, opacity: k === lvl ? 1 : 0.25 }} />)}
        </div>
        <div className="grid grid-cols-3 text-xs text-slate-400 mt-1"><span>Aman</span><span className="text-center">Waspada</span><span className="text-right">Bahaya</span></div>
      </div>
      <div className="space-y-5">
        <Block title="Petani belerang" items={a.petani} icon={Mountain} />
        <Block title="Warga" items={a.warga} icon={Home} />
      </div>
      <p className="text-xs text-slate-500 mt-5">Teks bahasa Madura masih draf dan perlu diverifikasi penutur asli.</p>
    </Panel>
  );
}

function CitizenView({ d }) {
  const bearing = bearingOf(d);
  return (
    <main className="max-w-screen-2xl mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
      <div className="lg:col-span-3 flex flex-col gap-4 sm:gap-6">
        <Panel title="Kualitas udara" aside={<Activity size={18} className="text-slate-500" />}>
          <ArcGauge value={d.so2} label="Sulfur dioksida (SO₂)" unit="ppm" limits={LIMITS.so2} />
          <div className="h-px bg-slate-800 my-4" />
          <ArcGauge value={d.h2s} label="Hidrogen sulfida (H₂S)" unit="ppm" limits={LIMITS.h2s} />
        </Panel>
        <Panel title="Kondisi lingkungan">
          <div className="grid grid-cols-2 gap-3">
            <Metric icon={Thermometer} label="Suhu" value={d.temp} unit="°C" pct={pctOf(d.temp, 50)} />
            <Metric icon={Droplet} label="Kelembapan" value={d.hum} unit="%" pct={pctOf(d.hum, 100)} />
          </div>
        </Panel>
      </div>
      <div className="lg:col-span-5 flex flex-col gap-4 sm:gap-6">
        <Panel title="Angin" aside={<Wind size={18} className="text-slate-500" />}><WindCompass from={d.windFrom} speed={d.windSpeed} /></Panel>
        <Panel title="Sebaran gas"><SpatialRadar bearing={bearing} /></Panel>
      </div>
      <div className="lg:col-span-4"><CitizenStatus d={d} /></div>
    </main>
  );
}

/* ---------- Root: percabangan berdasarkan peran ---------- */
function RoleView({ role, d }) {
  if (role === "admin") return <AdminView d={d} />;
  return <CitizenView d={d} />;
}

export default function BioNetsDashboard() {
  const [user, setUser] = useState(null);
  const tel = useTelemetry(!!user);
  const d = useMemo(() => (tel.raw ? mapTelemetry(tel.raw) : null), [tel.raw]);
  if (!user) return <LoginPage onLogin={setUser} />;

  const ageSec = d && d.ts > 1e12 ? Math.round((Date.now() - d.ts) / 1000) : null;
  const status = tel.status === "loading" ? "connecting" : tel.status === "live" && ageSec != null && ageSec > STALE_AFTER_S ? "stale" : tel.status === "live" ? "online" : tel.status;
  const conn = { status, hasData: !!d, ageSec, lastTime: clockOf(tel.updatedAt) };

  return (
    <Shell user={user} onLogout={() => setUser(null)} conn={conn}>
      {d ? <RoleView role={user.role} d={d} /> : <LoadingScreen status={tel.status} error={tel.error} />}
    </Shell>
  );
}
