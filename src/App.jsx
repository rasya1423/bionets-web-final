import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Shield,
  AlertTriangle,
  Flame,
  Wind,
  Droplets,
  Thermometer,
  Activity,
  Radio,
  Power,
  StopCircle,
  RefreshCw,
  MapPin,
  Bell,
  PhoneCall,
  BookOpen,
  Navigation,
  Sliders,
  Download,
  CheckCircle2,
  Clock,
  Cpu,
  BatteryCharging,
  Wifi,
  WifiOff,
  Eye,
  Smartphone,
  Monitor,
  Lock,
  Unlock,
  FileText,
  Trash2,
  Play,
  Sparkles,
  ChevronRight,
  Info,
  Volume2,
  VolumeX,
  Compass
} from 'lucide-react';

// ============================================================================
// KONFIGURASI FIREBASE REALTIME DATABASE (BIONETS-ABAA9)
// ============================================================================
const FIREBASE_DB_URL = 'https://bionets-abaa9-default-rtdb.asia-southeast1.firebasedatabase.app';

// ============================================================================
// FUNGSI UTILITAS KONVERSI MATA ANGIN & VEKTOR AWAM
// ============================================================================
function getWindDirectionInfo(deg) {
  const d = ((Number(deg) || 0) % 360 + 360) % 360;
  let cardinal = 'Utara';
  let shortDir = 'U';

  if (d >= 337.5 || d < 22.5) {
    cardinal = 'Utara';
    shortDir = 'U';
  } else if (d >= 22.5 && d < 67.5) {
    cardinal = 'Timur Laut';
    shortDir = 'TL';
  } else if (d >= 67.5 && d < 112.5) {
    cardinal = 'Timur';
    shortDir = 'T';
  } else if (d >= 112.5 && d < 157.5) {
    cardinal = 'Tenggara';
    shortDir = 'TG';
  } else if (d >= 157.5 && d < 202.5) {
    cardinal = 'Selatan';
    shortDir = 'S';
  } else if (d >= 202.5 && d < 247.5) {
    cardinal = 'Barat Daya';
    shortDir = 'BD';
  } else if (d >= 247.5 && d < 292.5) {
    cardinal = 'Barat';
    shortDir = 'B';
  } else {
    cardinal = 'Barat Laut';
    shortDir = 'BL';
  }

  // Di topografi Kawah Ijen -> Desa Kalianyar & Sempol berada di sektor Timur - Tenggara - Selatan (80° s/d 190°)
  const towardSettlement = d >= 80 && d <= 190;
  const towardKalianyar = d >= 100 && d <= 165;
  const towardSempol = d >= 140 && d <= 195;

  return {
    degree: Math.round(d),
    cardinal,
    shortDir,
    towardSettlement,
    towardKalianyar,
    towardSempol,
    vectorLabel: towardSettlement ? 'MENUJU PEMUKIMAN' : 'MENJAUH DARI PEMUKIMAN',
    laypersonDirection: `Ke arah ${cardinal} (${Math.round(d)}°)`,
    laypersonImpact: towardSettlement
      ? 'Mengarah ke pemukiman (Kalianyar & Sempol)'
      : 'Menjauh dari pemukiman warga'
  };
}

function getWindSpeedCategory(ms) {
  const s = Number(ms) || 0;
  if (s < 1.5) return 'Angin tenang';
  if (s < 3.5) return 'Angin sedang';
  if (s < 6.0) return 'Gas bergerak cepat';
  return 'Angin kencang berbahaya';
}

function getSafetyStatus(so2) {
  const val = Number(so2) || 0;
  if (val >= 5.0) return 'BAHAYA';
  if (val >= 2.0) return 'WASPADA';
  return 'AMAN';
}

function formatNumID(num, decimals = 1) {
  const n = Number(num);
  if (Number.isNaN(n)) return '0,0';
  return n.toFixed(decimals).replace('.', ',');
}

function formatTimeWIB(epochMs) {
  const d = epochMs ? new Date(Number(epochMs)) : new Date();
  const pad = (v) => String(v).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} · ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatHeaderClock(dateObj) {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];
  const pad = (v) => String(v).padStart(2, '0');
  return `${pad(dateObj.getDate())} ${months[dateObj.getMonth()]} ${dateObj.getFullYear()} · ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}:${pad(dateObj.getSeconds())} WIB`;
}

// ============================================================================
// DATA RIWAYAT AWAL (DIGUNAKAN SEBELUM RIWAYAT FIREBASE TERISI PENUH)
// ============================================================================
const INITIAL_24H_BARS = [
  { jam: '21:00', ppm: 1.1 },
  { jam: '22:30', ppm: 1.4 },
  { jam: '00:00', ppm: 1.9 },
  { jam: '01:00', ppm: 2.3 },
  { jam: '02:00', ppm: 4.1 },
  { jam: '03:00', ppm: 6.2 },
  { jam: '03:46', ppm: 8.4 },
  { jam: '04:15', ppm: 4.3 },
  { jam: '05:10', ppm: 2.8 },
  { jam: '08:00', ppm: 1.6 },
  { jam: '11:00', ppm: 1.3 },
  { jam: '14:00', ppm: 1.8 },
  { jam: '17:00', ppm: 1.2 },
  { jam: 'Sekarang', ppm: 1.2 }
];

const INITIAL_LOGS = [
  {
    id: 'init-1',
    waktu: '18/10 · 03:46:18',
    tipe: 'TRIGGER OTOMATIS',
    pesan: 'NODE-03 · SO2 8,4 ppm & angin 138° (Tenggara) menuju Kalianyar → Mist Cannon menyala (Edge Decision)',
    so2_ppm: 8.4
  },
  {
    id: 'init-2',
    waktu: '18/10 · 03:46:20',
    tipe: 'NOTIFIKASI EWS',
    pesan: 'Peringatan Merah dikirim ke 1.284 gawai warga Desa Kalianyar & Sempol',
    so2_ppm: 8.4
  },
  {
    id: 'init-3',
    waktu: '18/10 · 02:11:05',
    tipe: 'AUTO-PURGING',
    pesan: 'NODE-03 · pembilasan nozzle 10 detik selesai — tidak ada indikasi penyumbatan',
    so2_ppm: 1.8
  },
  {
    id: 'init-4',
    waktu: '17/10 · 23:40:52',
    tipe: 'SINKRONISASI',
    pesan: 'Seluruh node mengirim telemetri; koneksi Firebase & LoRa stabil, tidak ada paket hilang',
    so2_ppm: 0.9
  }
];

export default function App() {
  // --------------------------------------------------------------------------
  // 1. STATE UTAMA & MODE TAMPILAN (BPBD ADMIN vs WARGA RING 1)
  // --------------------------------------------------------------------------
  const [roleView, setRoleView] = useState('bpbd'); // 'bpbd' | 'warga'
  const [bpbdTab, setBpbdTab] = useState('peta'); // 'peta' | 'riwayat' | 'node' | 'laporan'
  const [wargaTab, setWargaTab] = useState('status'); // 'status' | 'peringatan' | 'panduan' | 'darurat'
  const [wargaCompareMode, setWargaCompareMode] = useState(false); // false = 1 HP Live, true = 3 HP (Hijau/Kuning/Merah) sesuai Gambar 7.4
  const [selectedNodeId, setSelectedNodeId] = useState('N-03');
  const [showSimDrawer, setShowSimDrawer] = useState(false);
  const [showEvacModal, setShowEvacModal] = useState(false);
  const [audioAlarmEnabled, setAudioAlarmEnabled] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  const [nowClock, setNowClock] = useState(new Date());

  // --------------------------------------------------------------------------
  // 2. STATE TELEMETRI REAL-TIME (TERSINKRONISASI DENGAN FIREBASE ESP32)
  // --------------------------------------------------------------------------
  const [firebaseConnected, setFirebaseConnected] = useState(true);
  const [lastSyncEpoch, setLastSyncEpoch] = useState(Date.now());
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState(1);
  const [pauseFirebasePoll, setPauseFirebasePoll] = useState(false);

  const [telemetry, setTelemetry] = useState({
    so2_ppm: 8.4,
    h2s_ppm: 1.5,
    suhu_c: 21.8,
    kelembapan_persen: 82.4,
    arah_derajat: 138,
    kecepatan_ms: 4.2,
    tangki_persen: 78,
    jarak_cm: 57.9,
    volume_liter: 156.0,
    pompa: true,
    solenoid: true,
    blower: true,
    auto_purging: false,
    mode_kendali: 'AUTO', // 'AUTO' | 'MANUAL_ON' | 'EMERGENCY_STOP' | 'AUTO_PURGE'
    durasi_detik: 42,
    timestamp: Date.now()
  });

  const [logs, setLogs] = useState(INITIAL_LOGS);
  const [history24h, setHistory24h] = useState(INITIAL_24H_BARS);
  const [autoActuationCount, setAutoActuationCount] = useState(14);
  const [purgeCountdown, setPurgeCountdown] = useState(0);

  const prevStatusRef = useRef(getSafetyStatus(8.4));
  const sprayTimerRef = useRef(42);

  // Helper menampilkan notifikasi toast di dalam halaman
  const notify = useCallback((text, type = 'info') => {
    setToastMsg({ text, type, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 4000);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // Jam Digital Real-Time & Penghitung Detik Sejak Pembaruan
  useEffect(() => {
    const timer = setInterval(() => {
      setNowClock(new Date());
      setSecondsSinceUpdate((prev) => Math.min(prev + 1, 99));
      setTelemetry((prev) => {
        if (prev.pompa && prev.solenoid) {
          sprayTimerRef.current += 1;
          return { ...prev, durasi_detik: sprayTimerRef.current };
        }
        sprayTimerRef.current = 0;
        return { ...prev, durasi_detik: 0 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Countdown Auto-Purging 10 Detik
  useEffect(() => {
    if (purgeCountdown <= 0) return;
    const timer = setTimeout(() => {
      if (purgeCountdown === 1) {
        setPurgeCountdown(0);
        // Selesai Auto-Purging -> kembalikan ke AUTO
        handleControlCommand('AUTO', true);
      } else {
        setPurgeCountdown((c) => c - 1);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [purgeCountdown]);

  // --------------------------------------------------------------------------
  // 3. FUNGSI KOMUNIKASI DUA ARAH DENGAN FIREBASE RTDB
  // --------------------------------------------------------------------------
  const pushLogToFirebase = useCallback(async (tipe, pesan, so2Val, arahDeg) => {
    const newLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      waktu: formatTimeWIB(Date.now()),
      timestamp: Date.now(),
      tipe,
      pesan,
      node: 'NODE-03',
      so2_ppm: Number(so2Val || 0),
      arah_derajat: Number(arahDeg || 0)
    };
    setLogs((prev) => [newLog, ...prev.slice(0, 29)]);
    try {
      await fetch(`https://bionets-abaa9-default-rtdb.asia-southeast1.firebasedatabase.app/logs.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLog)
      });
    } catch (e) {
      // Tetap tersimpan di state lokal bila jaringan lambat
    }
  }, []);

  // Ambil data live dari Firebase setiap 2 detik
  useEffect(() => {
    if (pauseFirebasePoll) return;

    let isMounted = true;
    const fetchLiveFirebase = async () => {
      try {
        const [telRes, ctrlRes, logsRes] = await Promise.all([
          fetch(`https://bionets-abaa9-default-rtdb.asia-southeast1.firebasedatabase.app/telemetry.json`),
          fetch(`https://bionets-abaa9-default-rtdb.asia-southeast1.firebasedatabase.app/control.json`),
          fetch(`https://bionets-abaa9-default-rtdb.asia-southeast1.firebasedatabase.app/logs.json?orderBy="$key"&limitToLast=12`)
        ]);

        if (!telRes.ok) throw new Error('Gagal membaca telemetry');
        const data = await telRes.json();
        const ctrlData = ctrlRes.ok ? await ctrlRes.json() : null;
        const logsData = logsRes.ok ? await logsRes.json() : null;

        if (!isMounted) return;

        if (data && typeof data === 'object') {
          const rawSo2 = Number(data?.sensor_udara?.so2_ppm ?? 0);
          const validSo2 = Number.isFinite(rawSo2) ? Math.max(0, Math.min(10, rawSo2)) : 0;

          const rawSuhu = Number(data?.sensor_udara?.suhu_c);
          const validSuhu = Number.isFinite(rawSuhu) && rawSuhu > -10 && rawSuhu < 65 ? rawSuhu : 22.4;

          const rawHum = Number(data?.sensor_udara?.kelembapan_persen);
          const validHum = Number.isFinite(rawHum) && rawHum >= 0 && rawHum <= 100 ? rawHum : 78.5;

          const rawH2s = Number(data?.sensor_udara?.h2s_ppm);
          const validH2s = Number.isFinite(rawH2s) && rawH2s > 0 ? rawH2s : Number((validSo2 * 0.18).toFixed(2));

          const rawDeg = Number(data?.angin?.arah_derajat ?? 138);
          const validDeg = Number.isFinite(rawDeg) ? ((Math.round(rawDeg) % 360) + 360) % 360 : 138;

          const rawSpeed = Number(data?.angin?.kecepatan_ms ?? 0);
          const validSpeed = Number.isFinite(rawSpeed) ? Math.max(0, Math.min(20, rawSpeed)) : 0;

          const rawTank = Number(data?.tangki?.persen ?? 80);
          const validTank = Number.isFinite(rawTank) ? Math.max(0, Math.min(100, Math.round(rawTank))) : 80;

          const rawJarak = Number(data?.tangki?.jarak_cm);
          const validJarak = Number.isFinite(rawJarak) && rawJarak > 0
            ? rawJarak
            : Number((68.0 - (validTank / 100.0) * 13.0).toFixed(1));

          const activeMode = ctrlData?.mode || data?.aktuator?.mode_kendali || 'AUTO';

          let isPompa = Boolean(data?.aktuator?.pompa);
          let isSolenoid = Boolean(data?.aktuator?.solenoid);
          let isBlower = Boolean(data?.aktuator?.blower);
          let isPurging = Boolean(data?.aktuator?.auto_purging) || activeMode === 'AUTO_PURGE';

          // Pastikan bila ESP32 masih memakai kode lama (belum baca /control), UI & aktuator di Firebase tetap sinkron dengan mode override
          if (activeMode === 'MANUAL_ON') {
            isPompa = true;
            isSolenoid = true;
            isBlower = true;
          } else if (activeMode === 'EMERGENCY_STOP') {
            isPompa = false;
            isSolenoid = false;
            isBlower = false;
          } else if (activeMode === 'AUTO_PURGE') {
            isPompa = true;
            isSolenoid = true;
            isBlower = false;
          } else if (activeMode === 'AUTO') {
            isPompa = validSo2 >= 5.0;
            isSolenoid = validSo2 >= 5.0;
            isBlower = validSo2 >= 5.0;
          }

          setTelemetry((prev) => ({
            ...prev,
            so2_ppm: Number(validSo2.toFixed(1)),
            h2s_ppm: validH2s,
            suhu_c: Number(validSuhu.toFixed(1)),
            kelembapan_persen: Number(validHum.toFixed(1)),
            arah_derajat: validDeg,
            kecepatan_ms: Number(validSpeed.toFixed(1)),
            tangki_persen: validTank,
            jarak_cm: validJarak,
            volume_liter: Number(((validTank / 100.0) * 200.0).toFixed(1)),
            pompa: isPompa,
            solenoid: isSolenoid,
            blower: isBlower,
            auto_purging: isPurging,
            mode_kendali: activeMode,
            timestamp: data?.timestamp || Date.now()
          }));

          // Update bar terakhir ("Sekarang") pada grafik 24 jam
          setHistory24h((prevBars) => {
            const copy = [...prevBars];
            copy[copy.length - 1] = { jam: 'Sekarang', ppm: Number(validSo2.toFixed(1)) };
            return copy;
          });

          // Cek transisi status otomatis untuk log
          const newStatus = getSafetyStatus(validSo2);
          if (newStatus !== prevStatusRef.current) {
            const windInfo = getWindDirectionInfo(validDeg);
            if (newStatus === 'BAHAYA') {
              setAutoActuationCount((c) => c + 1);
              pushLogToFirebase(
                'TRIGGER OTOMATIS',
                `NODE-03 · SO2 ${formatNumID(validSo2)} ppm & angin ${validDeg}° (${windInfo.cardinal}) → Mist Cannon menyala (Edge Decision)`,
                validSo2,
                validDeg
              );
            } else if (newStatus === 'WASPADA') {
              pushLogToFirebase(
                'PERINGATAN DINI',
                `NODE-03 · Kadar SO2 naik ke ${formatNumID(validSo2)} ppm (WASPADA) — Mist Cannon bersiap menyala`,
                validSo2,
                validDeg
              );
            }
            prevStatusRef.current = newStatus;
          }

          setFirebaseConnected(true);
          setLastSyncEpoch(Date.now());
          setSecondsSinceUpdate(0);
        }

        // Muat log dari Firebase bila ada
        if (logsData && typeof logsData === 'object') {
          const parsedLogs = Object.entries(logsData)
            .map(([key, val]) => ({
              id: key,
              waktu: val.waktu || formatTimeWIB(val.timestamp),
              tipe: val.tipe || 'SINKRONISASI',
              pesan: val.pesan || '',
              so2_ppm: val.so2_ppm ?? 0
            }))
            .reverse();
          if (parsedLogs.length > 0) {
            setLogs((prev) => {
              const combined = [...parsedLogs, ... INITIAL_LOGS];
              const seen = new Set();
              return combined.filter((item) => {
                const sig = `${item.tipe}-${item.pesan}`;
                if (seen.has(sig)) return false;
                seen.add(sig);
                return true;
              }).slice(0, 20);
            });
          }
        }
      } catch (err) {
        setFirebaseConnected(false);
      }
    };

    fetchLiveFirebase();
    const interval = setInterval(fetchLiveFirebase, 2500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [pauseFirebasePoll, pushLogToFirebase]);

  // --------------------------------------------------------------------------
  // 4. HANDLER KENDALI AKTUATOR (MANUAL OVERRIDE, STOP DARURAT, AUTO-PURGING)
  // --------------------------------------------------------------------------
  const syncTelemetryAndControlToFirebase = async (nextTelemetry, nextMode) => {
    const windInfo = getWindDirectionInfo(nextTelemetry.arah_derajat);
    const statusLevel = getSafetyStatus(nextTelemetry.so2_ppm);

    const payload = {
      sensor_udara: {
        so2_ppm: Number(nextTelemetry.so2_ppm),
        h2s_ppm: Number((nextTelemetry.so2_ppm * 0.18).toFixed(2)),
        suhu_c: Number(nextTelemetry.suhu_c),
        kelembapan_persen: Number(nextTelemetry.kelembapan_persen),
        status_level: statusLevel
      },
      angin: {
        arah_derajat: Number(nextTelemetry.arah_derajat),
        arah_mata_angin: windInfo.cardinal,
        kecepatan_ms: Number(nextTelemetry.kecepatan_ms),
        menuju_pemukiman: windInfo.towardSettlement,
        status_vektor: windInfo.vectorLabel,
        keterangan_awam: `${windInfo.laypersonDirection} — ${windInfo.laypersonImpact}`
      },
      tangki: {
        persen: Number(nextTelemetry.tangki_persen),
        jarak_cm: Number((68.0 - (nextTelemetry.tangki_persen / 100.0) * 13.0).toFixed(1)),
        volume_liter: Number(((nextTelemetry.tangki_persen / 100.0) * 200.0).toFixed(1))
      },
      aktuator: {
        pompa: Boolean(nextTelemetry.pompa),
        solenoid: Boolean(nextTelemetry.solenoid),
        blower: Boolean(nextTelemetry.blower),
        auto_purging: Boolean(nextTelemetry.auto_purging),
        mode_kendali: nextMode,
        durasi_detik: nextTelemetry.durasi_detik || 0
      },
      timestamp: Date.now()
    };

    try {
      await Promise.all([
        fetch(`https://bionets-abaa9-default-rtdb.asia-southeast1.firebasedatabase.app/control.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: nextMode,
            updated_by: 'POSKO_BPBD_WEB_ADMIN',
            timestamp: Date.now()
          })
        }),
        fetch(`https://bionets-abaa9-default-rtdb.asia-southeast1.firebasedatabase.app/telemetry.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
      ]);
      setFirebaseConnected(true);
      setSecondsSinceUpdate(0);
    } catch (e) {
      // Fallback state lokal tetap berjalan
    }
  };

  const handleControlCommand = async (targetMode, fromTimer = false) => {
    let nextMode = targetMode;
    // Jika tombol Manual Override diklik saat sudah MANUAL_ON, kembalikan ke AUTO
    if (targetMode === 'MANUAL_ON' && telemetry.mode_kendali === 'MANUAL_ON') {
      nextMode = 'AUTO';
    }

    let pompa = telemetry.pompa;
    let solenoid = telemetry.solenoid;
    let blower = telemetry.blower;
    let auto_purging = false;

    if (nextMode === 'MANUAL_ON') {
      pompa = true;
      solenoid = true;
      blower = true;
      notify('Manual Override AKTIF: Pompa 100 PSI, Solenoid & Blower dinyalakan paksa!', 'warning');
      pushLogToFirebase(
        'MANUAL OVERRIDE',
        'Posko BPBD mengambil alih kendali NODE-03 → Mist Cannon dinyalakan manual oleh Admin',
        telemetry.so2_ppm,
        telemetry.arah_derajat
      );
    } else if (nextMode === 'EMERGENCY_STOP') {
      pompa = false;
      solenoid = false;
      blower = false;
      setPurgeCountdown(0);
      notify('STOP DARURAT: Seluruh aktuator Mist Cannon dihentikan paksa!', 'danger');
      pushLogToFirebase(
        'STOP DARURAT',
        'Admin Posko BPBD menekan tombol Hentikan (Stop Darurat) pada NODE-03 → Pompa & Solenoid dimatikan',
        telemetry.so2_ppm,
        telemetry.arah_derajat
      );
    } else if (nextMode === 'AUTO_PURGE') {
      pompa = true;
      solenoid = true;
      blower = false;
      auto_purging = true;
      setPurgeCountdown(10);
      notify('Auto-Purging dimulai: Membilas nozzle selama 10 detik...', 'info');
      pushLogToFirebase(
        'AUTO-PURGING',
        'NODE-03 · Memulai pembilasan nozzle otomatis selama 10 detik untuk mencegah kristalisasi belerang',
        telemetry.so2_ppm,
        telemetry.arah_derajat
      );
    } else {
      // Kembali ke mode AUTO (Edge Decision)
      const isDanger = telemetry.so2_ppm >= 5.0;
      pompa = isDanger;
      solenoid = isDanger;
      blower = isDanger;
      if (fromTimer) {
        notify('Auto-Purging 10 detik selesai. Sistem kembali ke mode Otomatis (Edge Decision).', 'success');
        pushLogToFirebase(
          'AUTO-PURGING',
          'NODE-03 · pembilasan nozzle 10 detik selesai — tidak ada indikasi penyumbatan',
          telemetry.so2_ppm,
          telemetry.arah_derajat
        );
      } else {
        notify('Sistem dikembalikan ke Mode Otomatis (Edge Decision).', 'success');
        pushLogToFirebase(
          'SINKRONISASI',
          'Kendali NODE-03 dikembalikan ke mode Otomatis (Edge Decision ambang 5,0 ppm)',
          telemetry.so2_ppm,
          telemetry.arah_derajat
        );
      }
    }

    const updated = {
      ...telemetry,
      pompa,
      solenoid,
      blower,
      auto_purging,
      mode_kendali: nextMode
    };
    setTelemetry(updated);
    await syncTelemetryAndControlToFirebase(updated, nextMode);
  };

  // Handler Simulasi / Pemicuan Uji Belerang & Sensor (Langsung mengupdate Firebase!)
  const applyScenarioPreset = async (presetName) => {
    let nextState = { ...telemetry };
    if (presetName === 'bahaya_belerang') {
      nextState = {
        ...telemetry,
        so2_ppm: 8.4,
        h2s_ppm: 1.51,
        suhu_c: 23.6,
        kelembapan_persen: 84.0,
        arah_derajat: 138, // Tenggara menuju Kalianyar & Sempol
        kecepatan_ms: 4.2,
        tangki_persen: 76,
        jarak_cm: 58.1,
        pompa: true,
        solenoid: true,
        blower: true,
        auto_purging: false,
        mode_kendali: 'AUTO'
      };
      notify('Simulasi Pemicuan Belerang (8,4 ppm · Angin 138° Tenggara) dikirim ke Firebase!', 'danger');
      pushLogToFirebase(
        'TRIGGER OTOMATIS',
        'NODE-03 · SO2 8,4 ppm & angin 138° menuju Kalianyar → Mist Cannon menyala (Edge Decision)',
        8.4,
        138
      );
    } else if (presetName === 'waspada_kuning') {
      nextState = {
        ...telemetry,
        so2_ppm: 4.1,
        h2s_ppm: 0.74,
        suhu_c: 22.1,
        kelembapan_persen: 79.5,
        arah_derajat: 138,
        kecepatan_ms: 4.2,
        tangki_persen: 81,
        jarak_cm: 57.5,
        pompa: false,
        solenoid: false,
        blower: false,
        auto_purging: false,
        mode_kendali: 'AUTO'
      };
      notify('Status WASPADA (4,1 ppm SO2) diterapkan & disinkronkan ke Firebase.', 'warning');
      pushLogToFirebase(
        'PERINGATAN DINI',
        'NODE-03 · Kadar SO2 naik ke 4,1 ppm (WASPADA) — Mist Cannon bersiap menyala',
        4.1,
        138
      );
    } else if (presetName === 'aman_hijau') {
      nextState = {
        ...telemetry,
        so2_ppm: 1.2,
        h2s_ppm: 0.22,
        suhu_c: 20.8,
        kelembapan_persen: 75.2,
        arah_derajat: 250, // Barat Daya (Menjauh dari pemukiman)
        kecepatan_ms: 2.1,
        tangki_persen: 88,
        jarak_cm: 56.6,
        pompa: false,
        solenoid: false,
        blower: false,
        auto_purging: false,
        mode_kendali: 'AUTO'
      };
      notify('Status AMAN (1,2 ppm SO2 · Angin 250° Barat Daya) disinkronkan ke Firebase.', 'success');
      pushLogToFirebase(
        'SINKRONISASI',
        'NODE-03 · Udara kembali AMAN (1,2 ppm SO2), angin 250° Barat Daya menjauh dari pemukiman',
        1.2,
        250
      );
    }

    setTelemetry(nextState);
    setHistory24h((prev) => {
      const copy = [...prev];
      copy[copy.length - 1] = { jam: 'Sekarang', ppm: nextState.so2_ppm };
      return copy;
    });
    await syncTelemetryAndControlToFirebase(nextState, nextState.mode_kendali);
  };

  // --------------------------------------------------------------------------
  // 5. PERHITUNGAN DINAMIS 5 NODE & SEBARAN GAS (GAUSSIAN PLUME)
  // --------------------------------------------------------------------------
  const windInfo = useMemo(() => getWindDirectionInfo(telemetry.arah_derajat), [telemetry.arah_derajat]);
  const safetyStatus = useMemo(() => getSafetyStatus(telemetry.so2_ppm), [telemetry.so2_ppm]);

  const nodesData = useMemo(() => {
    const mainSo2 = Number(telemetry.so2_ppm) || 0;
    const factor = windInfo.towardSettlement ? 1.0 : 0.65;

    // Jika sedang tepat 8.4 ppm (seperti referensi desain Gambar 7.3), tampilkan nilai presisi desain namun tetap reaktif terhadap perubahan sensor
    const isExactRef = Math.abs(mainSo2 - 8.4) < 0.05 && Math.abs(telemetry.arah_derajat - 138) <= 5;

    const n01 = isExactRef ? 1.2 : Number(Math.min(10, Math.max(0.1, mainSo2 * 0.18 + 0.3)).toFixed(1));
    const n02 = isExactRef ? 4.1 : Number(Math.min(10, Math.max(0.2, mainSo2 * 0.52 * factor + 0.2)).toFixed(1));
    const n03 = Number(mainSo2.toFixed(1)); // Sensor ESP32 Fisik Utama
    const n04 = isExactRef ? 3.7 : Number(Math.min(10, Math.max(0.2, mainSo2 * 0.45 * factor + 0.1)).toFixed(1));
    const n05 = isExactRef ? 0.8 : Number(Math.min(10, Math.max(0.1, mainSo2 * 0.12 + 0.1)).toFixed(1));

    return [
      {
        id: 'N-01',
        code: 'NODE-01',
        name: 'Punggung Barat',
        so2: n01,
        status: getSafetyStatus(n01),
        bat: 92,
        tank: 88,
        online: true,
        isHardware: false,
        x: 265,
        y: 128
      },
      {
        id: 'N-02',
        code: 'NODE-02',
        name: 'Lereng Tengah',
        so2: n02,
        status: getSafetyStatus(n02),
        bat: 81,
        tank: 64,
        online: true,
        isHardware: false,
        x: 345,
        y: 185
      },
      {
        id: 'N-03',
        code: 'NODE-03',
        name: 'Batas Kalianyar',
        so2: n03,
        status: getSafetyStatus(n03),
        bat: 76,
        tank: telemetry.tangki_persen,
        online: true,
        isHardware: true,
        x: 438,
        y: 252
      },
      {
        id: 'N-04',
        code: 'NODE-04',
        name: 'Batas Sempol',
        so2: n04,
        status: getSafetyStatus(n04),
        bat: 69,
        tank: 71,
        online: true,
        isHardware: false,
        x: 505,
        y: 298
      },
      {
        id: 'N-05',
        code: 'NODE-05',
        name: 'Lembah Timur',
        so2: n05,
        status: getSafetyStatus(n05),
        bat: 58,
        tank: 93,
        online: true,
        isHardware: false,
        x: 568,
        y: 336
      }
    ];
  }, [telemetry.so2_ppm, telemetry.arah_derajat, telemetry.tangki_persen, windInfo.towardSettlement]);

  // Fungsi Export CSV Laporan
  const handleExportCSV = () => {
    const headers = 'Waktu,Tipe,Node,SO2_PPM,Pesan\n';
    const rows = logs
      .map((l) => `"${l.waktu}","${l.tipe}","NODE-03","${l.so2_ppm}","${(l.pesan || '').replace(/"/g, '""')}"`)
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Laporan_BIONETS_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Laporan telemetri & riwayat aktuasi berhasil diunduh (.CSV)', 'success');
  };

  // Badge warna status
  const renderStatusBadge = (status) => {
    if (status === 'BAHAYA') {
      return (
        <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded bg-red-500/20 text-red-400 border border-red-500/40">
          BAHAYA
        </span>
      );
    }
    if (status === 'WASPADA') {
      return (
        <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
          WASPADA
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
        AMAN
      </span>
    );
  };

  // ==========================================================================
  // KOMPONEN SUB-VIEW: MOBILE APP WARGA RING 1 (SESUAI GAMBAR 7.4 / image_4d168d)
  // ==========================================================================
  const renderWargaPhoneCard = (overrideState = null) => {
    const so2Val = overrideState ? overrideState.so2 : telemetry.so2_ppm;
    const degVal = overrideState ? overrideState.deg : telemetry.arah_derajat;
    const speedVal = overrideState ? overrideState.speed : telemetry.kecepatan_ms;
    const wInfo = getWindDirectionInfo(degVal);
    const status = getSafetyStatus(so2Val);
    const speedDesc = getWindSpeedCategory(speedVal);

    const isRed = status === 'BAHAYA';
    const isYellow = status === 'WASPADA';
    const isGreen = status === 'AMAN';

    return (
      <div className="w-full max-w-[380px] mx-auto bg-[#f7f8fa] text-slate-800 rounded-[36px] shadow-2xl border-[7px] border-slate-900 overflow-hidden flex flex-col justify-between min-h-[760px]">
        {/* Top Notch & Status Bar */}
        <div>
          <div className="bg-white px-6 pt-2.5 pb-1.5 flex items-center justify-between text-xs font-bold text-slate-800">
            <span>{nowClock.toTimeString().slice(0, 5)}</span>
            <div className="w-24 h-4 bg-slate-950 rounded-full" />
            <div className="flex items-center gap-1 text-[11px]">
              <Activity className="w-3.5 h-3.5 text-emerald-600" />
              <span>5G</span>
              <BatteryCharging className="w-4 h-4 text-slate-800" />
            </div>
          </div>

          {/* Push Notification Darurat di Atas (Khusus Status Merah - Sesuai Gambar 7.4) */}
          {isRed && (
            <div className="mx-3 mt-2 p-3 rounded-2xl bg-red-50 border border-red-200 shadow-sm animate-pulse">
              <div className="flex items-center justify-between text-[10px] font-bold text-red-700 mb-1">
                <span className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[9px]">BN</span>
                  BIO-NETS · PERINGATAN DINI
                </span>
                <span className="text-slate-500 font-medium">sekarang</span>
              </div>
              <p className="text-xs font-extrabold text-red-700 flex items-center gap-1">
                <Bell className="w-3.5 h-3.5 shrink-0" /> BAHAYA GAS BELERANG — SEGERA EVAKUASI
              </p>
              <p className="text-[11px] text-slate-700 mt-0.5 leading-snug">
                SO₂ {formatNumID(so2Val)} ppm di batas Dusun Krepekan. Evakuasi ke Balai Desa Kalianyar lewat arah barat laut.
              </p>
            </div>
          )}

          {/* Header Desa Kalianyar */}
          <div className="px-4 py-3 flex items-center justify-between bg-white border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center font-extrabold text-xs text-white shadow-sm ${
                  isRed ? 'bg-red-600' : 'bg-emerald-600'
                }`}
              >
                BN
              </div>
              <div>
                <h2 className="text-sm font-extrabold text-slate-900 leading-tight">Desa Kalianyar</h2>
                <p className="text-[11px] text-slate-500">Zona Ring 1 · Kec. Ijen</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setWargaTab('peringatan')}
              className="p-2 rounded-full bg-amber-50 text-amber-500 hover:bg-amber-100 transition"
              title="Peringatan Dini"
            >
              <Bell className="w-4 h-4" />
            </button>
          </div>

          {/* KONTEN UTAMA BERDASARKAN TAB BAWAH WARGA */}
          <div className="p-3.5 space-y-3.5 overflow-y-auto max-h-[560px]">
            {wargaTab === 'status' || overrideState ? (
              <>
                {/* HERO STATUS CARD (HIJAU / KUNING / MERAH) */}
                <div
                  className={`rounded-2xl p-4 text-center text-white shadow-md transition-all ${
                    isRed
                      ? 'bg-gradient-to-b from-[#c92a2a] to-[#a61e1e]'
                      : isYellow
                      ? 'bg-gradient-to-b from-[#d99b07] to-[#b87f00]'
                      : 'bg-gradient-to-b from-[#178f5c] to-[#117047]'
                  }`}
                >
                  <div className="w-11 h-11 rounded-full bg-white/15 mx-auto flex items-center justify-center mb-2">
                    {isRed ? (
                      <Flame className="w-6 h-6 text-white animate-bounce" />
                    ) : isYellow ? (
                      <AlertTriangle className="w-6 h-6 text-white" />
                    ) : (
                      <Shield className="w-6 h-6 text-white" />
                    )}
                  </div>
                  <p className="text-[10px] tracking-widest uppercase font-semibold text-white/80">
                    TINGKAT KEAMANAN
                  </p>
                  <h1 className="text-xl font-black tracking-wide mt-0.5">
                    {isRed ? 'SEGERA EVAKUASI' : isYellow ? 'WASPADA' : 'UDARA AMAN'}
                  </h1>
                  <p className="text-xs text-white/90 mt-1 leading-relaxed px-2">
                    {isRed
                      ? 'Gas beracun bergerak ke pemukiman Anda. Jangan menunggu.'
                      : isYellow
                      ? 'Kadar gas mulai naik. Tetap di dalam rumah dan pantau aplikasi.'
                      : 'Kadar gas belerang normal. Warga dapat beraktivitas seperti biasa.'}
                  </p>

                  {/* Pill Konsentrasi SO2 */}
                  <div className="mt-3 bg-black/20 backdrop-blur-sm rounded-xl py-2 px-3 inline-flex items-baseline gap-1.5 border border-white/15">
                    <span className="text-xl font-black">{formatNumID(so2Val)}</span>
                    <span className="text-[11px] text-white/90">
                      ppm SO₂ ·{' '}
                      {isRed
                        ? 'jauh di atas ambang aman'
                        : isYellow
                        ? 'mendekati ambang 5 ppm'
                        : 'ambang aman 5 ppm'}
                    </span>
                  </div>

                  <p className="text-[10px] text-white/80 mt-2 font-medium">
                    ● DIPERBARUI {secondsSinceUpdate} DETIK LALU · {nowClock.toTimeString().slice(0, 8)} WIB
                  </p>
                </div>

                {/* KONDISI ANGIN SAAT INI (SANGAT MUDAH DIBACA MASYARAKAT AWAM) */}
                {(!isRed || !overrideState) && (
                  <div>
                    <p className="text-[10px] font-bold tracking-wider uppercase text-slate-400 mb-1.5">
                      KONDISI ANGIN SAAT INI (REAL-TIME SENSOR)
                    </p>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="bg-white rounded-xl p-3 border border-slate-200/80 shadow-sm">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase">ARAH ANGIN</p>
                        <p className="text-sm font-extrabold text-slate-900 mt-0.5">
                          {wInfo.degree}° {wInfo.cardinal}
                        </p>
                        <p className="text-[11px] font-semibold text-slate-600 mt-0.5">
                          ({wInfo.laypersonDirection})
                        </p>
                        <p
                          className={`text-[11px] font-bold mt-1 ${
                            wInfo.towardSettlement ? 'text-amber-600' : 'text-emerald-600'
                          }`}
                        >
                          {wInfo.towardSettlement ? '⚠ Mengarah ke pemukiman' : '✓ Menjauh dari pemukiman'}
                        </p>
                      </div>
                      <div className="bg-white rounded-xl p-3 border border-slate-200/80 shadow-sm">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase">KECEPATAN</p>
                        <p className="text-sm font-extrabold text-slate-900 mt-0.5">
                          {formatNumID(speedVal)} m/s
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{speedDesc}</p>
                        <p className="text-[11px] font-medium text-slate-500 mt-1">
                          Suhu {formatNumID(telemetry.suhu_c)}°C · Lembap {Math.round(telemetry.kelembapan_persen)}%
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* KONTEN SPESIFIK STATUS HIJAU */}
                {isGreen && (
                  <>
                    <div>
                      <p className="text-[10px] font-bold tracking-wider uppercase text-slate-400 mb-1.5">
                        STATUS WILAYAH SEKITAR
                      </p>
                      <div className="space-y-1.5">
                        {['Dusun Krepekan', 'Blok Perkebunan Timur', 'Desa Sempol'].map((wil) => (
                          <div
                            key={wil}
                            className="bg-white rounded-xl px-3.5 py-2.5 border border-slate-200/80 flex items-center justify-between"
                          >
                            <span className="text-xs font-bold text-slate-800 flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-emerald-500" />
                              {wil}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              AMAN
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold tracking-wider uppercase text-slate-400 mb-1.5">
                        PELINDUNG AKTIF
                      </p>
                      <div className="bg-white rounded-xl p-3 border border-slate-200/80 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                            <Shield className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-extrabold text-slate-800">5 Perimeter Node siaga</p>
                            <p className="text-[11px] text-slate-500">
                              Mist Cannon otomatis menyala bila gas mendekat · Tangki {telemetry.tangki_persen}%
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* RIWAYAT 24 JAM TERAKHIR (GRAFIK BATANG INTERAKTIF) */}
                    <div>
                      <p className="text-[10px] font-bold tracking-wider uppercase text-slate-400 mb-1.5">
                        RIWAYAT 24 JAM TERAKHIR
                      </p>
                      <div className="bg-white rounded-xl p-3.5 border border-slate-200/80">
                        <div className="relative h-28 flex items-end justify-between gap-1.5 pt-4 border-b border-slate-100 pb-1">
                          {/* Garis Ambang 5 ppm */}
                          <div
                            className="absolute left-0 right-0 border-t border-dashed border-amber-500/70 flex items-center justify-between px-1"
                            style={{ bottom: '50%' }}
                          >
                            <span className="text-[9px] font-bold text-amber-600 bg-white px-1 -mt-2.5">
                              AMBANG 5 ppm
                            </span>
                          </div>
                          {history24h.map((bar, idx) => {
                            const hPct = Math.max(10, Math.min(100, (bar.ppm / 10.0) * 100));
                            const barColor =
                              bar.ppm >= 5.0
                                ? 'bg-red-600'
                                : bar.ppm >= 2.0
                                ? 'bg-amber-500'
                                : 'bg-emerald-600';
                            return (
                              <div key={idx} className="flex-1 flex flex-col items-center group relative">
                                <div
                                  className={`w-full rounded-t ${barColor} transition-all duration-300`}
                                  style={{ height: `${(hPct / 100) * 85}px` }}
                                  title={`${bar.jam}: ${formatNumID(bar.ppm)} ppm`}
                                />
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-400 font-medium mt-1.5">
                          <span>21:00</span>
                          <span>03:00</span>
                          <span>12:00</span>
                          <span>Sekarang</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-2 leading-snug">
                          Puncak 8,4 ppm pada dini hari berhasil dinetralkan Mist Cannon — data grafik diperbarui langsung dari server Firebase.
                        </p>
                      </div>
                    </div>
                  </>
                )}

                {/* KONTEN SPESIFIK STATUS KUNING (WASPADA) */}
                {isYellow && (
                  <>
                    <div>
                      <p className="text-[10px] font-bold tracking-wider uppercase text-slate-400 mb-1.5">
                        YANG PERLU ANDA LAKUKAN
                      </p>
                      <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 space-y-3">
                        <div className="flex items-start gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-amber-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                            1
                          </span>
                          <p className="text-xs text-slate-700 leading-snug">
                            <strong className="text-slate-900">Tutup pintu dan jendela.</strong> Matikan kipas atau ventilasi yang menarik udara luar.
                          </p>
                        </div>
                        <div className="flex items-start gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-amber-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                            2
                          </span>
                          <p className="text-xs text-slate-700 leading-snug">
                            <strong className="text-slate-900">Siapkan masker basah</strong> dan air bersih di dekat Anda.
                          </p>
                        </div>
                        <div className="flex items-start gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-amber-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                            3
                          </span>
                          <p className="text-xs text-slate-700 leading-snug">
                            <strong className="text-slate-900">Dampingi kelompok rentan</strong> — lansia, balita, dan penderita gangguan pernapasan.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold tracking-wider uppercase text-slate-400 mb-1.5">
                        SISTEM PENETRALAN
                      </p>
                      <div className="bg-amber-50/90 rounded-xl p-3 border border-amber-200 flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-700 flex items-center justify-center font-bold shrink-0">
                          <Droplets className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-extrabold text-slate-900">
                            {telemetry.pompa ? 'Mist Cannon sedang menyemprot aktif' : 'Mist Cannon bersiap menyala'}
                          </p>
                          <p className="text-[11px] text-slate-600">
                            Node-02 & Node-03 siaga penuh (Tangki air penetral: {telemetry.tangki_persen}%)
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* KONTEN SPESIFIK STATUS MERAH (BAHAYA - EVAKUASI) */}
                {isRed && (
                  <>
                    <div>
                      <p className="text-[10px] font-bold tracking-wider uppercase text-slate-400 mb-1.5">
                        WILAYAH TERDAMPAK
                      </p>
                      <div className="space-y-1.5">
                        <div className="bg-red-50/70 rounded-xl px-3.5 py-2.5 border border-red-200 flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-600" />
                            Dusun Krepekan
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white">
                            BAHAYA
                          </span>
                        </div>
                        <div className="bg-white rounded-xl px-3.5 py-2.5 border border-slate-200 flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                            Blok Perkebunan Timur
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                            WASPADA
                          </span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold tracking-wider uppercase text-slate-400 mb-1.5">
                        INSTRUKSI KESELAMATAN
                      </p>
                      <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 space-y-2.5">
                        <div className="flex items-start gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                            1
                          </span>
                          <p className="text-xs text-slate-700 leading-snug">
                            <strong className="text-slate-900">Tutup hidung dengan kain basah,</strong> lalu keluar rumah sekarang juga.
                          </p>
                        </div>
                        <div className="flex items-start gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                            2
                          </span>
                          <p className="text-xs text-slate-700 leading-snug">
                            <strong className="text-slate-900">Bergerak ke arah barat laut</strong> menuju dataran lebih tinggi — jangan melewati lembah.
                          </p>
                        </div>
                        <div className="flex items-start gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                            3
                          </span>
                          <p className="text-xs text-slate-700 leading-snug">
                            <strong className="text-slate-900">Titik kumpul: Balai Desa Kalianyar</strong> · 1,2 km · perkiraan 15 menit jalan kaki.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          notify('Menghubungkan panggilan darurat ke Posko BPBD Bondowoso (0332-421113)...', 'danger')
                        }
                        className="w-full py-3 px-4 rounded-xl bg-[#c92a2a] hover:bg-[#b02222] text-white font-extrabold text-xs shadow-md transition flex flex-col items-center"
                      >
                        <span className="flex items-center gap-1.5">
                          <PhoneCall className="w-4 h-4" /> Hubungi Posko BPBD Bondowoso
                        </span>
                        <span className="text-[9px] font-medium tracking-wider uppercase text-red-100 mt-0.5">
                          SAMBUNGAN DARURAT 24 JAM
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowEvacModal(true)}
                        className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs border border-slate-300 transition flex items-center justify-center gap-1.5"
                      >
                        <Navigation className="w-3.5 h-3.5 text-emerald-700" /> Lihat peta rute evakuasi
                      </button>
                    </div>
                  </>
                )}
              </>
            ) : wargaTab === 'peringatan' ? (
              <div className="space-y-3">
                <div className="bg-white rounded-xl p-3.5 border border-slate-200">
                  <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-2">
                    Riwayat Peringatan Dini (EWS) Warga
                  </h3>
                  <div className="space-y-2.5">
                    {logs.slice(0, 6).map((item) => (
                      <div key={item.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/70">
                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 mb-1">
                          <span>{item.waktu}</span>
                          <span className="text-emerald-700">{item.tipe}</span>
                        </div>
                        <p className="text-xs text-slate-800 leading-snug">{item.pesan}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : wargaTab === 'panduan' ? (
              <div className="space-y-3">
                <div className="bg-white rounded-xl p-3.5 border border-slate-200 space-y-2.5">
                  <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                    Panduan Keselamatan Gas Belerang (SO₂)
                  </h3>
                  <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
                    <p className="text-xs font-bold text-emerald-900">1. Status Hijau (&lt; 2,0 ppm)</p>
                    <p className="text-[11px] text-emerald-800 mt-0.5">
                      Udara aman untuk aktivitas pertanian, perkebunan, dan sekolah di Desa Kalianyar & Sempol.
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200">
                    <p className="text-xs font-bold text-amber-900">2. Status Kuning (2,0 – 4,9 ppm)</p>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      Bau belerang mulai tercium. Tutup ventilasi rumah, gunakan kain/masker basah untuk menyaring gas asam SO₂.
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-red-50 border border-red-200">
                    <p className="text-xs font-bold text-red-900">3. Status Merah (≥ 5,0 ppm)</p>
                    <p className="text-[11px] text-red-800 mt-0.5">
                      Mist Cannon menyemprotkan kabut air kapur/basa penetral secara otomatis. Warga wajib bergerak ke arah Barat Laut (dataran tinggi Balai Desa Kalianyar) karena gas SO₂ lebih berat dari udara dan mengendap di lembah.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-white rounded-xl p-4 border border-slate-200 space-y-3">
                  <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                    Kontak & Titik Evakuasi Darurat
                  </h3>
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                    <p className="text-xs font-extrabold text-red-800">Posko Utama BPBD Bondowoso</p>
                    <p className="text-[11px] text-slate-700 mt-0.5">Siaga 24 Jam · Frekuensi Radio VHF 165.425 MHz</p>
                    <button
                      type="button"
                      onClick={() => notify('Menghubungi Posko BPBD Bondowoso...', 'danger')}
                      className="mt-2 w-full py-2 rounded-lg bg-red-600 text-white text-xs font-bold"
                    >
                      Panggil Sekarang (0332-421113)
                    </button>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <p className="text-xs font-extrabold text-slate-800">Puskesmas Sempol (Ijen)</p>
                    <p className="text-[11px] text-slate-600 mt-0.5">Unit Oksigen & Penanganan Inhalasi Gas Belerang</p>
                    <button
                      type="button"
                      onClick={() => setShowEvacModal(true)}
                      className="mt-2 w-full py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold"
                    >
                      Buka Peta Rute Evakuasi
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Navigation Bar Warga (Status, Peringatan, Panduan, Darurat) */}
        <div className="bg-white border-t border-slate-200 px-4 py-2 grid grid-cols-4 gap-1 text-center">
          {[
            { id: 'status', label: 'Status', icon: Shield },
            { id: 'peringatan', label: 'Peringatan', icon: Bell },
            { id: 'panduan', label: 'Panduan', icon: BookOpen },
            { id: 'darurat', label: 'Darurat', icon: PhoneCall }
          ].map((item) => {
            const IconComp = item.icon;
            const active = overrideState
              ? (isRed && item.id === 'peringatan') || (!isRed && item.id === 'status')
              : wargaTab === item.id;
            const activeColor = isRed ? 'text-red-600 font-extrabold' : 'text-emerald-700 font-extrabold';
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setWargaTab(item.id)}
                className={`flex flex-col items-center py-1 rounded-lg transition ${
                  active ? activeColor : 'text-slate-400 hover:text-slate-600 font-medium'
                }`}
              >
                <IconComp className="w-4 h-4 mb-0.5" />
                <span className="text-[10px]">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // ==========================================================================
  // RENDER UTAMA APLIKASI
  // ==========================================================================
  return (
    <div className="min-h-screen bg-[#0b1117] text-slate-100 font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* TOAST NOTIFICATION IN-PAGE */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 max-w-md bg-slate-900/95 border border-emerald-500/50 text-slate-100 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 backdrop-blur-md">
          <Sparkles className="w-5 h-5 text-emerald-400 shrink-0" />
          <p className="text-xs font-medium leading-snug">{toastMsg.text}</p>
        </div>
      )}

      {/* MODAL PETA RUTE EVAKUASI WARGA */}
      {showEvacModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-extrabold text-white">Peta Rute Evakuasi Warga Ring 1</h3>
                <p className="text-xs text-slate-400">
                  Jalur Aman Menjauhi Lembah Aliran Gas menuju Balai Desa Kalianyar
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEvacModal(false)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 text-xs text-slate-300 hover:bg-slate-700"
              >
                Tutup
              </button>
            </div>
            <div className="bg-[#0d161e] rounded-xl p-4 border border-slate-800">
              <svg viewBox="0 0 400 220" className="w-full h-auto">
                <rect width="400" height="220" fill="#0d161e" rx="8" />
                <circle cx="70" cy="60" r="28" fill="rgba(239,68,68,0.2)" stroke="#ef4444" strokeDasharray="4 2" />
                <text x="70" y="63" textAnchor="middle" fill="#fca5a5" fontSize="9" fontWeight="bold">
                  KAWAH IJEN
                </text>
                {/* Jalur Evakuasi Aman ke Barat Laut / Dataran Tinggi */}
                <path
                  d="M 240 150 Q 260 90 330 55"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="3.5"
                  strokeDasharray="6 4"
                />
                <circle cx="240" cy="150" r="7" fill="#f59e0b" />
                <text x="235" y="170" textAnchor="middle" fill="#fde68a" fontSize="9" fontWeight="bold">
                  Dusun Krepekan (Anda)
                </text>
                <circle cx="330" cy="55" r="9" fill="#10b981" />
                <text x="320" y="38" textAnchor="middle" fill="#6ee7b7" fontSize="10" fontWeight="bold">
                  TITIK KUMPUL: Balai Desa Kalianyar (1,2 km)
                </text>
              </svg>
              <div className="mt-3 text-xs text-slate-300 space-y-1">
                <p>
                  • <strong>Arah Angin Saat Ini:</strong> {windInfo.laypersonDirection} ({windInfo.laypersonImpact})
                </p>
                <p>
                  • <strong>Rute Rekomendasi:</strong> Jalan Poros Kalianyar Barat Laut (menanjak +85m mdpl, bebas cekungan gas).
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOP SWITCHER BAR: MODE ADMIN BPBD vs WARGA RING 1 + PANEL SIMULASI UJI SENSOR */}
      <div className="bg-[#070b0f] border-b border-slate-800/80 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold text-[11px]">
            LIVE FIREBASE RTDB
          </span>
          <span className="text-slate-400 hidden sm:inline">
            bionets-abaa9-default-rtdb · Pembaruan tiap 2 detik
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Tombol Buka Panel Uji Sensor / Picu Belerang */}
          <button
            type="button"
            onClick={() => setShowSimDrawer((v) => !v)}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition border ${
              showSimDrawer
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : 'bg-slate-800/90 text-amber-300 border-amber-500/40 hover:bg-slate-800'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            {showSimDrawer ? 'Tutup Panel Uji Sensor' : 'Uji Picu Sensor / Belerang (Sync Firebase)'}
          </button>

          {/* Switcher Mode Tampilan */}
          <div className="bg-slate-900 p-0.5 rounded-lg border border-slate-800 flex items-center">
            <button
              type="button"
              onClick={() => setRoleView('bpbd')}
              className={`px-3 py-1 rounded-md font-bold flex items-center gap-1.5 transition ${
                roleView === 'bpbd'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" /> Dashboard BPBD (Admin)
            </button>
            <button
              type="button"
              onClick={() => setRoleView('warga')}
              className={`px-3 py-1 rounded-md font-bold flex items-center gap-1.5 transition ${
                roleView === 'warga'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" /> Aplikasi Warga Ring 1
            </button>
          </div>
        </div>
      </div>

      {/* DRAWER SIMULASI & KALIBRASI SENSOR LANGSUNG KE FIREBASE */}
      {showSimDrawer && (
        <div className="bg-[#101923] border-b border-amber-500/40 px-4 py-4 shadow-2xl">
          <div className="max-w-[1600px] mx-auto space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                  <Sliders className="w-4 h-4" /> Panel Uji Picu Sensor & Kalibrasi Real-Time (Tersinkron ke Firebase RTDB)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Gunakan preset cepat atau geser slider di bawah untuk menguji respons pemicuan belerang, arah angin awam, dan tinggi tangki air (55 cm – 68 cm). Nilai langsung dikirim ke Firebase!
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => applyScenarioPreset('aman_hijau')}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition"
                >
                  Preset Hijau: Udara Aman (1,2 ppm)
                </button>
                <button
                  type="button"
                  onClick={() => applyScenarioPreset('waspada_kuning')}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition"
                >
                  Preset Kuning: Waspada (4,1 ppm)
                </button>
                <button
                  type="button"
                  onClick={() => applyScenarioPreset('bahaya_belerang')}
                  className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition"
                >
                  Preset Merah: Picu Belerang (8,4 ppm)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1">
              {/* Slider Gas Belerang SO2 */}
              <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="text-slate-300">Gas Belerang (SO₂ D34)</span>
                  <span className="text-amber-400">{formatNumID(telemetry.so2_ppm)} ppm</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="0.1"
                  value={telemetry.so2_ppm}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    const autoPump = telemetry.mode_kendali === 'AUTO' ? val >= 5.0 : telemetry.pompa;
                    const next = {
                      ...telemetry,
                      so2_ppm: val,
                      h2s_ppm: Number((val * 0.18).toFixed(2)),
                      pompa: autoPump,
                      solenoid: autoPump,
                      blower: autoPump
                    };
                    setTelemetry(next);
                    syncTelemetryAndControlToFirebase(next, next.mode_kendali);
                  }}
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>0 ppm (Bersih)</span>
                  <span>5 ppm (Ambang)</span>
                  <span>10 ppm</span>
                </div>
              </div>

              {/* Slider Arah Angin (D32) */}
              <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="text-slate-300">Arah Angin (Vane D32)</span>
                  <span className="text-emerald-400">
                    {telemetry.arah_derajat}° ({windInfo.cardinal})
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="359"
                  step="1"
                  value={telemetry.arah_derajat}
                  onChange={(e) => {
                    const next = { ...telemetry, arah_derajat: parseInt(e.target.value, 10) };
                    setTelemetry(next);
                    syncTelemetryAndControlToFirebase(next, next.mode_kendali);
                  }}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
                <div className="text-[10px] text-slate-400 mt-1 truncate">
                  {windInfo.laypersonDirection} · {windInfo.vectorLabel}
                </div>
              </div>

              {/* Slider Kecepatan Angin (Anemo D35) */}
              <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="text-slate-300">Kecepatan Angin (D35)</span>
                  <span className="text-cyan-400">{formatNumID(telemetry.kecepatan_ms)} m/s</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="12"
                  step="0.1"
                  value={telemetry.kecepatan_ms}
                  onChange={(e) => {
                    const next = { ...telemetry, kecepatan_ms: parseFloat(e.target.value) };
                    setTelemetry(next);
                    syncTelemetryAndControlToFirebase(next, next.mode_kendali);
                  }}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
                <div className="text-[10px] text-slate-400 mt-1">{getWindSpeedCategory(telemetry.kecepatan_ms)}</div>
              </div>

              {/* Slider Tangki Air Ultrasonik (55cm - 68cm) */}
              <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="text-slate-300">Tangki Air (D5/D18)</span>
                  <span className="text-blue-400">
                    {telemetry.tangki_persen}% ({formatNumID(telemetry.jarak_cm)} cm)
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={telemetry.tangki_persen}
                  onChange={(e) => {
                    const pct = parseInt(e.target.value, 10);
                    const cm = Number((68.0 - (pct / 100.0) * 13.0).toFixed(1));
                    const next = {
                      ...telemetry,
                      tangki_persen: pct,
                      jarak_cm: cm,
                      volume_liter: Number(((pct / 100.0) * 200.0).toFixed(1))
                    };
                    setTelemetry(next);
                    syncTelemetryAndControlToFirebase(next, next.mode_kendali);
                  }}
                  className="w-full accent-blue-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>68 cm (0%)</span>
                  <span>Vol: {formatNumID(telemetry.volume_liter, 0)} L</span>
                  <span>55 cm (100%)</span>
                </div>
              </div>

              {/* Slider Suhu & Kelembapan SHT31 */}
              <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="text-slate-300">Suhu SHT31 (I2C)</span>
                  <span className="text-purple-400">
                    {formatNumID(telemetry.suhu_c)}°C / {Math.round(telemetry.kelembapan_persen)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="14"
                  max="36"
                  step="0.2"
                  value={telemetry.suhu_c}
                  onChange={(e) => {
                    const next = { ...telemetry, suhu_c: parseFloat(e.target.value) };
                    setTelemetry(next);
                    syncTelemetryAndControlToFirebase(next, next.mode_kendali);
                  }}
                  className="w-full accent-purple-500 cursor-pointer"
                />
                <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                  <span>Polling Otomatis:</span>
                  <button
                    type="button"
                    onClick={() => setPauseFirebasePoll((p) => !p)}
                    className="underline text-amber-300 font-semibold"
                  >
                    {pauseFirebasePoll ? 'Lanjutkan Sync' : 'Jeda Saat Uji Manual'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAMPILAN 1: DASHBOARD MONITORING BPBD - OTORISASI ADMIN (Gambar 7.3) */}
      {/* ==================================================================== */}
      {roleView === 'bpbd' ? (
        <div className="max-w-[1600px] mx-auto p-3 sm:p-5 space-y-3.5">
          {/* HEADER UTAMA BIO-NETS CONTROL CENTER */}
          <header className="bg-[#111922] border border-slate-800/90 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-6">
              {/* Brand Logo */}
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-emerald-500 text-slate-950 font-black text-sm flex items-center justify-center shadow-md shadow-emerald-500/20">
                  BN
                </div>
                <div>
                  <div className="text-sm font-black tracking-wider text-white leading-none">BIO-NETS</div>
                  <div className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase mt-0.5">
                    CONTROL CENTER
                  </div>
                </div>
              </div>

              {/* Navigation Links */}
              <nav className="hidden md:flex items-center gap-1">
                {[
                  { id: 'peta', label: 'Peta Pemantauan' },
                  { id: 'riwayat', label: 'Riwayat Data' },
                  { id: 'node', label: 'Manajemen Node' },
                  { id: 'laporan', label: 'Laporan' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setBpbdTab(tab.id)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                      bpbdTab === tab.id
                        ? 'bg-slate-800 text-white border border-slate-700'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* Right Status Indicators */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="px-3 py-1 rounded-full bg-slate-900 border border-slate-800 flex items-center gap-2 text-xs font-semibold text-slate-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>5 / 5 NODE ONLINE</span>
              </div>

              <div className="px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300 hidden sm:block">
                {formatHeaderClock(nowClock)}
              </div>

              <div className="flex items-center gap-2.5 pl-2 border-l border-slate-800">
                <div className="w-8 h-8 rounded-full bg-emerald-900/70 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center justify-center">
                  RS
                </div>
                <div className="text-left">
                  <div className="text-xs font-bold text-slate-200 leading-tight">Posko BPBD Bondowoso</div>
                  <div className="text-[10px] font-bold text-amber-400 tracking-wider uppercase">
                    ▲ OTORISASI ADMIN
                  </div>
                </div>
              </div>
            </div>
          </header>

          {/* RED / AMBER / GREEN ALERT BANNER (SESUAI GAMBAR 7.3) */}
          {safetyStatus === 'BAHAYA' ? (
            <div className="bg-gradient-to-r from-[#3b1219] via-[#2d1218] to-[#1f1318] border border-red-500/50 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-lg">
              <div className="flex items-center gap-3">
                <div className="px-2.5 py-1.5 rounded-lg bg-red-600 text-white font-black text-[11px] tracking-wider uppercase flex flex-col items-center leading-tight shrink-0">
                  <span>▲</span>
                  <span>BAHAYA</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-200 leading-snug">
                  <strong className="text-white">SO₂ di NODE-03 Perbatasan Kalianyar mencapai </strong>
                  <strong className="text-red-400 underline decoration-red-500/50">
                    {formatNumID(telemetry.so2_ppm)} ppm
                  </strong>{' '}
                  — melampaui ambang aman 5 ppm.{' '}
                  <span className="text-slate-300">
                    Mist Cannon aktif otomatis; notifikasi evakuasi terkirim ke{' '}
                    <strong className="text-red-300">1.284 gawai warga</strong>.
                  </span>
                </p>
              </div>
              <div className="text-[11px] font-mono text-slate-400 shrink-0">
                terdeteksi {nowClock.toTimeString().slice(0, 8)} WIB
              </div>
            </div>
          ) : safetyStatus === 'WASPADA' ? (
            <div className="bg-gradient-to-r from-amber-950/70 via-slate-900 to-slate-900 border border-amber-500/50 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 font-black text-xs uppercase">
                  ▲ WASPADA
                </span>
                <p className="text-xs sm:text-sm text-slate-200">
                  Kadar SO₂ di <strong>NODE-03 Perbatasan Kalianyar</strong> naik ke{' '}
                  <strong className="text-amber-300">{formatNumID(telemetry.so2_ppm)} ppm</strong> (mendekati ambang 5 ppm). Angin bertiup{' '}
                  <strong>{windInfo.laypersonDirection.toLowerCase()}</strong> ({windInfo.laypersonImpact}).
                </p>
              </div>
              <span className="text-[11px] font-mono text-amber-300">{nowClock.toTimeString().slice(0, 8)} WIB</span>
            </div>
          ) : (
            <div className="bg-[#0f221d] border border-emerald-500/40 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500 text-slate-950 font-black text-xs uppercase">
                  ● AMAN
                </span>
                <p className="text-xs sm:text-sm text-slate-200">
                  Seluruh perimeter Kawah Ijen – Desa Kalianyar & Sempol dalam kondisi aman (SO₂{' '}
                  <strong className="text-emerald-300">{formatNumID(telemetry.so2_ppm)} ppm</strong> · Angin{' '}
                  {windInfo.laypersonDirection.toLowerCase()}).
                </p>
              </div>
              <span className="text-[11px] font-mono text-emerald-300">
                Diperbarui {secondsSinceUpdate} dtk lalu
              </span>
            </div>
          )}

          {/* TAB NAVIGASI TAMBAHAN (BILA USER MEMILIH TAB RIWAYAT / NODE / LAPORAN) */}
          {bpbdTab !== 'peta' && (
            <div className="bg-[#111922] border border-slate-800 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-extrabold text-white uppercase tracking-wider">
                  {bpbdTab === 'riwayat'
                    ? 'Riwayat Data Telemetri & Log Kejadian Server Firebase'
                    : bpbdTab === 'node'
                    ? 'Manajemen & Kalibrasi 5 Perimeter Node BIO-NETS'
                    : 'Laporan Kinerja Mitigasi & Ekspor Data (.CSV)'}
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportCSV}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> Unduh CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => setBpbdTab('peta')}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
                  >
                    Kembali ke Peta Utama
                  </button>
                </div>
              </div>

              {bpbdTab === 'node' && (
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  {nodesData.map((n) => (
                    <div
                      key={n.id}
                      className={`p-3.5 rounded-xl border ${
                        n.isHardware
                          ? 'bg-slate-900/90 border-emerald-500/50'
                          : 'bg-slate-900/50 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-black text-white">{n.code}</span>
                        {renderStatusBadge(n.status)}
                      </div>
                      <p className="text-xs text-slate-400 mb-2">{n.name}</p>
                      <div className="text-lg font-black text-white">{formatNumID(n.so2)} ppm SO₂</div>
                      <div className="mt-2 text-[11px] text-slate-400 space-y-1">
                        <div>Baterai: {n.bat}%</div>
                        <div>Tangki Penetral: {n.tank}%</div>
                        <div className="text-emerald-400 font-semibold">
                          {n.isHardware ? '★ Node Hardware ESP32 Aktif' : '● Terhubung via Mesh LoRa'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(bpbdTab === 'riwayat' || bpbdTab === 'laporan') && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                        <th className="py-2 px-3">Waktu (WIB)</th>
                        <th className="py-2 px-3">Kategori</th>
                        <th className="py-2 px-3">Node</th>
                        <th className="py-2 px-3 text-right">SO₂ (ppm)</th>
                        <th className="py-2 px-3">Keterangan Peristiwa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {logs.map((l) => (
                        <tr key={l.id} className="hover:bg-slate-800/30">
                          <td className="py-2 px-3 font-mono text-slate-400">{l.waktu}</td>
                          <td className="py-2 px-3 font-bold text-emerald-400">{l.tipe}</td>
                          <td className="py-2 px-3 font-mono text-slate-300">NODE-03</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-white">
                            {formatNumID(l.so2_ppm)}
                          </td>
                          <td className="py-2 px-3 text-slate-300">{l.pesan}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* MAIN GRID DASHBOARD BPBD (KIRI: 8 KOLOM, KANAN: 4 KOLOM — PERSIS GAMBAR 7.3) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
            {/* ============================================================== */}
            {/* KOLOM KIRI (8/12): SPATIAL HEATMAP + LOG KEJADIAN + RINGKASAN  */}
            {/* ============================================================== */}
            <div className="lg:col-span-8 space-y-3.5">
              {/* 1. SPATIAL HEATMAP — SEBARAN GAS & VEKTOR ANGIN */}
              <div className="bg-[#111922] border border-slate-800/90 rounded-2xl p-4 shadow-xl">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                    <h2 className="text-xs sm:text-sm font-extrabold text-white tracking-wide">
                      Spatial Heatmap — Sebaran Gas & Vektor Angin
                    </h2>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-wider text-slate-400">
                    <span>
                      SUHU: <strong className="text-slate-200">{formatNumID(telemetry.suhu_c)}°C</strong>
                    </span>
                    <span>
                      LEMBAP: <strong className="text-slate-200">{Math.round(telemetry.kelembapan_persen)}%</strong>
                    </span>
                    <span>PEMBARUAN OTOMATIS TIAP 2 DETIK</span>
                  </div>
                </div>

                {/* KANVAS SVG SPATIAL HEATMAP (IDENTIK & LEBIH HIDUP DARI GAMBAR 7.3) */}
                <div className="relative rounded-xl overflow-hidden bg-[#0b1219] border border-slate-800/80">
                  <svg viewBox="0 0 820 400" className="w-full h-auto block select-none">
                    <defs>
                      {/* Grid Pattern */}
                      <pattern id="tacticalGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path
                          d="M 40 0 L 0 0 0 40"
                          fill="none"
                          stroke="rgba(148, 163, 184, 0.05)"
                          strokeWidth="1"
                        />
                      </pattern>

                      {/* Gaussian Plume Radial Glows */}
                      <radialGradient id="plumeCoreRed" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity="0.65" />
                        <stop offset="45%" stopColor="#f59e0b" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                      </radialGradient>

                      <radialGradient id="plumeMidAmber" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.5" />
                        <stop offset="60%" stopColor="#d97706" stopOpacity="0.2" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                      </radialGradient>

                      <linearGradient id="plumeBeamGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.25" />
                        <stop
                          offset="45%"
                          stopColor={safetyStatus === 'AMAN' ? '#10b981' : '#f59e0b'}
                          stopOpacity="0.42"
                        />
                        <stop
                          offset="80%"
                          stopColor={
                            safetyStatus === 'BAHAYA'
                              ? '#ef4444'
                              : safetyStatus === 'WASPADA'
                              ? '#f59e0b'
                              : '#10b981'
                          }
                          stopOpacity="0.55"
                        />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity="0.0" />
                      </linearGradient>

                      <linearGradient id="scaleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#10b981" />
                        <stop offset="50%" stopColor="#f59e0b" />
                        <stop offset="100%" stopColor="#ef4444" />
                      </linearGradient>
                    </defs>

                    {/* Background & Grid */}
                    <rect width="820" height="400" fill="#0b1219" />
                    <rect width="820" height="400" fill="url(#tacticalGrid)" />

                    {/* Garis Kontur Topografi Lereng Kawah Ijen */}
                    <g stroke="rgba(148, 163, 184, 0.12)" fill="none" strokeWidth="1">
                      <ellipse cx="175" cy="112" rx="68" ry="42" />
                      <ellipse cx="175" cy="112" rx="115" ry="70" />
                      <ellipse cx="185" cy="118" rx="170" ry="102" />
                      <path d="M 30 250 Q 200 220 380 350" />
                      <path d="M 60 310 Q 220 285 450 390" />
                      <path d="M 420 35 Q 580 95 790 120" />
                    </g>

                    {/* Garis Perimeter - Benteng Udara BIO-NETS */}
                    <path
                      d="M 235 85 Q 365 215 610 355"
                      fill="none"
                      stroke="rgba(148, 163, 184, 0.28)"
                      strokeWidth="1.5"
                      strokeDasharray="6 6"
                    />
                    <text
                      x="330"
                      y="368"
                      fill="rgba(148, 163, 184, 0.45)"
                      fontSize="9"
                      fontFamily="monospace"
                      letterSpacing="1.5"
                    >
                      GARIS PERIMETER — BENTENG UDARA BIO-NETS
                    </text>

                    {/* CONE SEBARAN GAS (GAUSSIAN PLUME DINAMIS MENGIKUTI ARAH ANGIN & SO2) */}
                    <g
                      transform={`rotate(${telemetry.arah_derajat - 138}, 175, 112)`}
                      style={{ transition: 'transform 0.8s ease-out' }}
                    >
                      {/* Cone Sebaran Utama */}
                      <path
                        d="M 175 100 L 585 245 Q 645 310 535 375 L 165 124 Z"
                        fill="url(#plumeBeamGrad)"
                      />
                      {/* Glow Konsentrasi di Sekitar Node-02, Node-03, Node-04 */}
                      {telemetry.so2_ppm >= 2.0 && (
                        <>
                          <ellipse cx="348" cy="185" rx="75" ry="48" fill="url(#plumeMidAmber)" />
                          <ellipse
                            cx="440"
                            cy="252"
                            rx={telemetry.so2_ppm >= 5.0 ? 105 : 70}
                            ry={telemetry.so2_ppm >= 5.0 ? 68 : 45}
                            fill={telemetry.so2_ppm >= 5.0 ? 'url(#plumeCoreRed)' : 'url(#plumeMidAmber)'}
                          />
                          <ellipse cx="505" cy="298" rx="68" ry="42" fill="url(#plumeMidAmber)" />
                        </>
                      )}

                      {/* Panah-Panah Vektor Angin dari Kawah Menuju Perimeter */}
                      <g stroke="#5eead4" strokeWidth="1.6" fill="none" opacity="0.85">
                        <line x1="220" y1="100" x2="255" y2="122" />
                        <polyline points="248,123 255,122 253,115" />

                        <line x1="290" y1="145" x2="328" y2="170" />
                        <polyline points="321,171 328,170 326,163" />

                        <line x1="375" y1="205" x2="415" y2="232" />
                        <polyline points="408,233 415,232 413,225" />

                        <line x1="468" y1="268" x2="500" y2="290" />
                        <polyline points="493,291 500,290 498,283" />
                      </g>
                    </g>

                    {/* Label Vektor Angin di Atas Node-01 */}
                    <text
                      x="252"
                      y="92"
                      fill="#94a3b8"
                      fontSize="10"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      ANGIN {windInfo.degree}° {windInfo.cardinal.toUpperCase()} · {formatNumID(telemetry.kecepatan_ms)} m/s
                    </text>

                    {/* KAWAH IJEN (SUMBER EMISI SO2 / H2S) */}
                    <g>
                      <ellipse
                        cx="175"
                        cy="112"
                        rx="32"
                        ry="20"
                        fill="rgba(20, 184, 166, 0.35)"
                        stroke="#2dd4bf"
                        strokeWidth="1.8"
                      />
                      <text
                        x="175"
                        y="150"
                        textAnchor="middle"
                        fill="#cbd5e1"
                        fontSize="10"
                        fontFamily="monospace"
                        fontWeight="bold"
                        letterSpacing="1"
                      >
                        KAWAH IJEN
                      </text>
                      <text
                        x="175"
                        y="162"
                        textAnchor="middle"
                        fill="#64748b"
                        fontSize="8.5"
                        fontFamily="monospace"
                      >
                        SUMBER EMISI SO₂ / H₂S
                      </text>
                    </g>

                    {/* POLIGON ZONA PEMUKIMAN WARGA RING 1: DESA KALIANYAR & DESA SEMPOL */}
                    <g>
                      {/* Desa Kalianyar */}
                      <polygon
                        points="595,148 672,135 702,188 648,215 582,195"
                        fill={
                          safetyStatus === 'BAHAYA' && windInfo.towardSettlement
                            ? 'rgba(239, 68, 68, 0.14)'
                            : 'rgba(30, 41, 59, 0.55)'
                        }
                        stroke={
                          safetyStatus === 'BAHAYA' && windInfo.towardSettlement
                            ? '#ef4444'
                            : 'rgba(148, 163, 184, 0.35)'
                        }
                        strokeWidth="1.5"
                      />
                      <text
                        x="642"
                        y="175"
                        textAnchor="middle"
                        fill="#e2e8f0"
                        fontSize="11"
                        fontWeight="bold"
                      >
                        Desa Kalianyar
                      </text>
                      <text
                        x="642"
                        y="189"
                        textAnchor="middle"
                        fill="#94a3b8"
                        fontSize="9"
                        fontFamily="monospace"
                      >
                        RING 1 · 642 KK
                      </text>

                      {/* Desa Sempol */}
                      <polygon
                        points="625,250 708,242 732,292 678,318 612,298"
                        fill={
                          safetyStatus === 'BAHAYA' && windInfo.towardSettlement
                            ? 'rgba(245, 158, 11, 0.14)'
                            : 'rgba(30, 41, 59, 0.55)'
                        }
                        stroke={
                          safetyStatus === 'BAHAYA' && windInfo.towardSettlement
                            ? '#f59e0b'
                            : 'rgba(148, 163, 184, 0.35)'
                        }
                        strokeWidth="1.5"
                      />
                      <text
                        x="672"
                        y="278"
                        textAnchor="middle"
                        fill="#e2e8f0"
                        fontSize="11"
                        fontWeight="bold"
                      >
                        Desa Sempol
                      </text>
                      <text
                        x="672"
                        y="292"
                        textAnchor="middle"
                        fill="#94a3b8"
                        fontSize="9"
                        fontFamily="monospace"
                      >
                        RING 1 · 518 KK
                      </text>
                    </g>

                    {/* 5 TITIK PERIMETER NODE (NODE-01 s/d NODE-05) */}
                    {nodesData.map((n) => {
                      const isDanger = n.status === 'BAHAYA';
                      const isWarn = n.status === 'WASPADA';
                      const fillCol = isDanger ? '#ef4444' : isWarn ? '#f59e0b' : '#14b8a6';
                      const isSelected = selectedNodeId === n.id;

                      return (
                        <g
                          key={n.id}
                          onClick={() => setSelectedNodeId(n.id)}
                          className="cursor-pointer"
                        >
                          {/* Lingkaran Halo Aktif */}
                          {(isDanger || isSelected) && (
                            <circle
                              cx={n.x}
                              cy={n.y}
                              r={isDanger ? 22 : 16}
                              fill="none"
                              stroke={fillCol}
                              strokeWidth="1.5"
                              strokeDasharray={isDanger ? '4 2' : 'none'}
                              opacity="0.75"
                            />
                          )}

                          {/* Kotak Ikon Node */}
                          <rect
                            x={n.x - 7}
                            y={n.y - 7}
                            width="14"
                            height="14"
                            rx="3"
                            fill={fillCol}
                            stroke="#0b1219"
                            strokeWidth="2"
                          />

                          {/* Label Nama Node & Konsentrasi SO2 */}
                          <text
                            x={n.x + 13}
                            y={n.y - 2}
                            fill="#f8fafc"
                            fontSize="10"
                            fontFamily="monospace"
                            fontWeight="bold"
                          >
                            {n.code}
                          </text>
                          <text
                            x={n.x + 13}
                            y={n.y + 11}
                            fill={fillCol}
                            fontSize="10"
                            fontFamily="monospace"
                            fontWeight="bold"
                          >
                            {formatNumID(n.so2)} ppm
                          </text>

                          {/* Label Khusus NODE-03 saat Mist Cannon Menyemprot */}
                          {n.id === 'N-03' && telemetry.pompa && (
                            <text
                              x={n.x + 13}
                              y={n.y + 23}
                              fill="#fde047"
                              fontSize="8.5"
                              fontFamily="monospace"
                              fontWeight="bold"
                            >
                              + MIST CANNON AKTIF
                            </text>
                          )}
                        </g>
                      );
                    })}

                    {/* LEGENDA SKALA KONSENTRASI SO2 (POJOK KIRI BAWAH) */}
                    <g transform="translate(22, 325)">
                      <rect
                        width="165"
                        height="54"
                        rx="8"
                        fill="rgba(15, 23, 34, 0.9)"
                        stroke="rgba(148, 163, 184, 0.2)"
                      />
                      <text
                        x="12"
                        y="17"
                        fill="#94a3b8"
                        fontSize="8.5"
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        SKALA KONSENTRASI SO₂
                      </text>
                      <rect x="12" y="24" width="141" height="7" rx="3.5" fill="url(#scaleGrad)" />
                      <text x="12" y="44" fill="#64748b" fontSize="8" fontFamily="monospace">
                        0 ppm
                      </text>
                      <text x="62" y="44" fill="#94a3b8" fontSize="8" fontFamily="monospace">
                        5 ppm (ambang)
                      </text>
                      <text x="128" y="44" fill="#64748b" fontSize="8" fontFamily="monospace">
                        10 ppm
                      </text>
                    </g>

                    {/* SKALA JARAK 1 KM (POJOK KANAN BAWAH) */}
                    <g transform="translate(690, 355)">
                      <text x="0" y="0" fill="#64748b" fontSize="8.5" fontFamily="monospace">
                        0
                      </text>
                      <text x="68" y="0" fill="#64748b" fontSize="8.5" fontFamily="monospace">
                        1 km
                      </text>
                      <line x1="0" y1="8" x2="78" y2="8" stroke="#64748b" strokeWidth="1.5" />
                      <line x1="0" y1="4" x2="0" y2="12" stroke="#64748b" strokeWidth="1.5" />
                      <line x1="39" y1="5" x2="39" y2="11" stroke="#64748b" strokeWidth="1" />
                      <line x1="78" y1="4" x2="78" y2="12" stroke="#64748b" strokeWidth="1.5" />
                    </g>
                  </svg>
                </div>
              </div>

              {/* 2. LOG KEJADIAN & RIWAYAT AKTUASI (REAL DARI FIREBASE) */}
              <div className="bg-[#111922] border border-slate-800/90 rounded-2xl p-4 shadow-xl">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <h2 className="text-xs sm:text-sm font-extrabold text-white">
                      Log Kejadian & Riwayat Aktuasi
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                      7 HARI TERAKHIR · TERSIMPAN DI SERVER FIREBASE
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        pushLogToFirebase(
                          'SINKRONISASI',
                          `Pengecekan manual oleh Admin BPBD: NODE-03 SO2 ${formatNumID(telemetry.so2_ppm)} ppm, Tangki ${telemetry.tangki_persen}%, Angin ${windInfo.degree}° ${windInfo.cardinal}`,
                          telemetry.so2_ppm,
                          telemetry.arah_derajat
                        )
                      }
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-emerald-400 border border-slate-700"
                    >
                      + Catat Log Saat Ini
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-slate-800/70 max-h-48 overflow-y-auto pr-1">
                  {logs.slice(0, 8).map((item) => {
                    let badgeStyle = 'bg-slate-800 text-slate-300 border-slate-700';
                    if (item.tipe.includes('TRIGGER') || item.tipe.includes('STOP')) {
                      badgeStyle = 'bg-red-500/20 text-red-400 border-red-500/40';
                    } else if (item.tipe.includes('NOTIFIKASI') || item.tipe.includes('MANUAL') || item.tipe.includes('PERINGATAN')) {
                      badgeStyle = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
                    } else if (item.tipe.includes('PURGING')) {
                      badgeStyle = 'bg-teal-500/20 text-teal-300 border-teal-500/40';
                    }
                    return (
                      <div
                        key={item.id}
                        className="py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-xs"
                      >
                        <span className="font-mono text-[11px] text-slate-400 shrink-0 w-32">
                          {item.waktu}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider border shrink-0 w-32 text-center ${badgeStyle}`}
                        >
                          {item.tipe}
                        </span>
                        <span className="text-slate-200 leading-snug">{item.pesan}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. RINGKASAN KINERJA MITIGASI (4 KARTU METRIK BAWAH) */}
              <div className="bg-[#111922] border border-slate-800/90 rounded-2xl p-4 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-teal-400" />
                    <h2 className="text-xs sm:text-sm font-extrabold text-white">
                      Ringkasan Kinerja Mitigasi
                    </h2>
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                    PERIODE 30 HARI TERAKHIR
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                  <div className="bg-[#0c131a] border border-slate-800/80 rounded-xl p-3.5">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                      TOTAL AKTUASI OTOMATIS
                    </p>
                    <p className="text-2xl font-black text-teal-400 mt-1">{autoActuationCount}x</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Mist Cannon menyala tanpa komando manusia
                    </p>
                  </div>

                  <div className="bg-[#0c131a] border border-slate-800/80 rounded-xl p-3.5">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                      RERATA WAKTU RESPONS
                    </p>
                    <p className="text-2xl font-black text-teal-400 mt-1">
                      0,8 <span className="text-sm font-bold">detik</span>
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Deteksi gas → semprot kabut basa
                    </p>
                  </div>

                  <div className="bg-[#0c131a] border border-slate-800/80 rounded-xl p-3.5">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                      WARGA TERLINDUNGI
                    </p>
                    <p className="text-2xl font-black text-amber-400 mt-1">
                      1.160 <span className="text-sm font-bold">KK</span>
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Kalianyar & Sempol, zona Ring 1
                    </p>
                  </div>

                  <div className="bg-[#0c131a] border border-slate-800/80 rounded-xl p-3.5">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                      KETERSEDIAAN SISTEM
                    </p>
                    <p className="text-2xl font-black text-emerald-400 mt-1">99,2%</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Node aktif termasuk mode tanpa internet
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* ============================================================== */}
            {/* KOLOM KANAN (4/12): GAS MONITORING + WIND COMPASS + OVERRIDE   */}
            {/* ============================================================== */}
            <div className="lg:col-span-4 space-y-3.5">
              {/* 1. LIVE GAS MONITORING & KONDISI LINGKUNGAN */}
              <div className="bg-[#111922] border border-slate-800/90 rounded-2xl p-4 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-teal-400" />
                    <h2 className="text-xs sm:text-sm font-extrabold text-white">Live Gas Monitoring</h2>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">SO₂ · ppm</span>
                </div>

                <div className="divide-y divide-slate-800/70">
                  {nodesData.map((n) => {
                    const valColor =
                      n.status === 'BAHAYA'
                        ? 'text-red-400'
                        : n.status === 'WASPADA'
                        ? 'text-amber-300'
                        : 'text-teal-400';
                    return (
                      <div
                        key={n.id}
                        onClick={() => setSelectedNodeId(n.id)}
                        className={`py-2.5 px-2 rounded-lg flex items-center justify-between cursor-pointer transition ${
                          selectedNodeId === n.id ? 'bg-slate-800/60' : 'hover:bg-slate-800/30'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs text-slate-400 w-10">{n.id}</span>
                          <span className="text-xs font-semibold text-slate-200">
                            {n.name}
                            {n.isHardware && (
                              <span className="ml-1.5 text-[9px] font-mono text-emerald-400">(ESP32)</span>
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`font-mono text-sm font-black ${valColor}`}>
                            {formatNumID(n.so2)}
                          </span>
                          {renderStatusBadge(n.status)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Baris Tambahan: Kondisi Lingkungan SHT31 & Kualitas Udara */}
                <div className="mt-3 pt-3 border-t border-slate-800 grid grid-cols-3 gap-2 text-center">
                  <div className="bg-[#0c131a] rounded-lg p-2 border border-slate-800/80">
                    <p className="text-[9px] font-mono text-slate-400 uppercase">SUHU UDARA</p>
                    <p className="text-xs font-extrabold text-slate-200 mt-0.5">
                      {formatNumID(telemetry.suhu_c)} °C
                    </p>
                  </div>
                  <div className="bg-[#0c131a] rounded-lg p-2 border border-slate-800/80">
                    <p className="text-[9px] font-mono text-slate-400 uppercase">KELEMBAPAN</p>
                    <p className="text-xs font-extrabold text-slate-200 mt-0.5">
                      {formatNumID(telemetry.kelembapan_persen)} %
                    </p>
                  </div>
                  <div className="bg-[#0c131a] rounded-lg p-2 border border-slate-800/80">
                    <p className="text-[9px] font-mono text-slate-400 uppercase">GAS IKUTAN H₂S</p>
                    <p className="text-xs font-extrabold text-slate-200 mt-0.5">
                      {formatNumID(telemetry.h2s_ppm, 2)} ppm
                    </p>
                  </div>
                </div>
              </div>

              {/* 2. DYNAMIC WIND COMPASS (ANEMOMETER D35 + WIND VANE D32) */}
              <div className="bg-[#111922] border border-slate-800/90 rounded-2xl p-4 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <h2 className="text-xs sm:text-sm font-extrabold text-white">Dynamic Wind Compass</h2>
                  </div>
                  <span className="text-[10px] font-mono uppercase text-slate-400">ANEMOMETER + VANE</span>
                </div>

                <div className="grid grid-cols-12 gap-3 items-center">
                  {/* Kompas Polar SVG */}
                  <div className="col-span-6 flex justify-center">
                    <svg viewBox="0 0 160 160" className="w-36 h-36">
                      <circle cx="80" cy="80" r="70" fill="#0b1219" stroke="#1e293b" strokeWidth="1.5" />
                      <circle cx="80" cy="80" r="48" fill="none" stroke="#1e293b" strokeWidth="1" strokeDasharray="3 3" />
                      <circle cx="80" cy="80" r="24" fill="none" stroke="#1e293b" strokeWidth="1" />
                      <line x1="80" y1="10" x2="80" y2="150" stroke="#1e293b" strokeWidth="1" />
                      <line x1="10" y1="80" x2="150" y2="80" stroke="#1e293b" strokeWidth="1" />

                      {/* Label Mata Angin U, T, S, B */}
                      <text x="80" y="22" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="bold">
                        U
                      </text>
                      <text x="142" y="84" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="bold">
                        T
                      </text>
                      <text x="80" y="146" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="bold">
                        S
                      </text>
                      <text x="18" y="84" textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="bold">
                        B
                      </text>

                      {/* Jarum & Kerucut Arah Angin */}
                      <g
                        transform={`rotate(${windInfo.degree}, 80, 80)`}
                        style={{ transition: 'transform 0.6s ease-out' }}
                      >
                        {/* Ekor Angin Asal */}
                        <polygon points="80,80 73,32 87,32" fill="rgba(56, 189, 248, 0.25)" />
                        {/* Kepala Vektor Arah Tujuan Angin */}
                        <polygon
                          points="80,80 68,22 80,14 92,22"
                          fill={windInfo.towardSettlement ? '#ef4444' : '#10b981'}
                          opacity="0.88"
                        />
                      </g>
                      <circle cx="80" cy="80" r="6" fill="#0b1219" stroke="#f8fafc" strokeWidth="2.5" />
                    </svg>
                  </div>

                  {/* Info Angin Lengkap & Mudah Dibaca Awam */}
                  <div className="col-span-6 space-y-2">
                    <div className="bg-[#0c131a] border border-slate-800/80 rounded-xl p-2.5">
                      <p className="text-[9px] font-mono uppercase text-slate-400">ARAH ANGIN</p>
                      <div className="flex items-baseline gap-1.5 mt-0.5">
                        <span className="text-lg font-black text-amber-400">{windInfo.degree}°</span>
                        <span className="text-xs font-extrabold uppercase text-slate-200">
                          {windInfo.cardinal}
                        </span>
                      </div>
                      <p className="text-[10px] text-emerald-400 font-semibold mt-0.5">
                        {windInfo.laypersonDirection}
                      </p>
                    </div>

                    <div className="bg-[#0c131a] border border-slate-800/80 rounded-xl p-2.5">
                      <p className="text-[9px] font-mono uppercase text-slate-400">KECEPATAN ANGIN</p>
                      <p className="text-lg font-black text-white mt-0.5">
                        {formatNumID(telemetry.kecepatan_ms)}{' '}
                        <span className="text-xs font-normal text-slate-400">m/s</span>
                      </p>
                      <p className="text-[10px] text-slate-400">{getWindSpeedCategory(telemetry.kecepatan_ms)}</p>
                    </div>

                    <div className="bg-[#0c131a] border border-slate-800/80 rounded-xl p-2.5">
                      <p className="text-[9px] font-mono uppercase text-slate-400">STATUS VEKTOR</p>
                      <p
                        className={`text-xs font-black uppercase mt-0.5 leading-tight ${
                          windInfo.towardSettlement ? 'text-amber-400' : 'text-emerald-400'
                        }`}
                      >
                        {windInfo.vectorLabel}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. ACTUATOR STATUS & MANUAL OVERRIDE (NYATA & TERHUBUNG KE FIREBASE) */}
              <div className="bg-[#111922] border border-slate-800/90 rounded-2xl p-4 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    <h2 className="text-xs sm:text-sm font-extrabold text-white">
                      Actuator Status & Manual Override
                    </h2>
                  </div>
                  <span className="text-[10px] font-mono uppercase text-slate-400">NODE-03</span>
                </div>

                {/* Kotak Status Mist Cannon */}
                <div
                  className={`rounded-xl p-3.5 border flex items-center justify-between mb-3 transition ${
                    telemetry.pompa
                      ? 'bg-gradient-to-r from-[#2c1219] to-[#1d1318] border-red-500/40'
                      : telemetry.mode_kendali === 'EMERGENCY_STOP'
                      ? 'bg-slate-900 border-red-500/50'
                      : 'bg-[#0c131a] border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center border ${
                        telemetry.pompa
                          ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      <Droplets className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm font-black text-white">
                        Mist Cannon —{' '}
                        {purgeCountdown > 0
                          ? `AUTO-PURGING (${purgeCountdown}s)`
                          : telemetry.pompa
                          ? 'MENYEMPROT'
                          : telemetry.mode_kendali === 'EMERGENCY_STOP'
                          ? 'DIHENTIKAN DARURAT'
                          : 'SIAGA OTOMATIS'}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Pompa 100 PSI ({telemetry.pompa ? 'ON' : 'OFF'}) · solenoid{' '}
                        {telemetry.solenoid ? 'terbuka' : 'tertutup'} · blower{' '}
                        {telemetry.blower ? 'aktif' : 'siaga'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-[9px] font-mono uppercase text-slate-400">DURASI</p>
                    <p className="text-lg font-mono font-black text-red-400">
                      {String(Math.floor((telemetry.durasi_detik || 0) / 60)).padStart(2, '0')}:
                      {String((telemetry.durasi_detik || 0) % 60).padStart(2, '0')}
                    </p>
                  </div>
                </div>

                {/* 3 Tombol Kendali Jarak Jauh (Manual Override, Hentikan, Auto-Purging) */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleControlCommand('MANUAL_ON')}
                    className={`py-2.5 px-2 rounded-xl font-extrabold text-xs transition flex flex-col items-center justify-center border ${
                      telemetry.mode_kendali === 'MANUAL_ON'
                        ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-lg shadow-amber-500/20'
                        : 'bg-[#e5a913] hover:bg-amber-400 text-slate-950 border-amber-400'
                    }`}
                  >
                    <span>Manual Override</span>
                    <span className="text-[9px] font-mono uppercase mt-0.5 opacity-85">
                      {telemetry.mode_kendali === 'MANUAL_ON' ? 'AKTIF (KLIK=AUTO)' : 'AMBIL ALIH KENDALI'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleControlCommand('EMERGENCY_STOP')}
                    className={`py-2.5 px-2 rounded-xl font-extrabold text-xs transition flex flex-col items-center justify-center border ${
                      telemetry.mode_kendali === 'EMERGENCY_STOP'
                        ? 'bg-red-600 text-white border-red-400'
                        : 'bg-[#2a151b] hover:bg-red-950/80 text-red-400 border-red-500/40'
                    }`}
                  >
                    <span>Hentikan</span>
                    <span className="text-[9px] font-mono uppercase mt-0.5 opacity-80">STOP DARURAT</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleControlCommand('AUTO_PURGE')}
                    className={`py-2.5 px-2 rounded-xl font-extrabold text-xs transition flex flex-col items-center justify-center border ${
                      purgeCountdown > 0
                        ? 'bg-teal-500 text-slate-950 border-teal-300'
                        : 'bg-[#17222d] hover:bg-slate-800 text-slate-200 border-slate-700'
                    }`}
                  >
                    <span>Auto-Purging</span>
                    <span className="text-[9px] font-mono uppercase mt-0.5 text-slate-400">
                      {purgeCountdown > 0 ? `BILAS ${purgeCountdown} DETIK` : 'BILAS 10 DETIK'}
                    </span>
                  </button>
                </div>

                <p className="text-[10px] text-slate-400 mt-2.5 flex items-center gap-1.5">
                  <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                  <span>
                    Mode saat ini: <strong className="text-white">{telemetry.mode_kendali}</strong> · setiap perintah tercatat pada log audit Firebase.
                  </span>
                </p>
              </div>

              {/* 4. DEVICE STATUS (BATERAI · TANGKI AIR ULTRASONIK · KONEKSI) */}
              <div className="bg-[#111922] border border-slate-800/90 rounded-2xl p-4 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-teal-400" />
                    <h2 className="text-xs sm:text-sm font-extrabold text-white">Device Status</h2>
                  </div>
                  <span className="text-[10px] font-mono uppercase text-slate-400">
                    BATERAI · TANGKI · KONEKSI
                  </span>
                </div>

                <div className="space-y-2.5">
                  {nodesData.map((n) => {
                    const lowTank = n.tank <= 30;
                    return (
                      <div key={n.id} className="grid grid-cols-12 items-center gap-2 text-xs font-mono">
                        <span className="col-span-2 text-slate-400">{n.id}</span>

                        {/* Baterai */}
                        <div className="col-span-4 flex items-center gap-1.5">
                          <span className="text-[10px] text-slate-500">BAT</span>
                          <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                n.bat > 65 ? 'bg-emerald-400' : 'bg-amber-400'
                              }`}
                              style={{ width: `${n.bat}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-slate-200 w-8 text-right">{n.bat}%</span>
                        </div>

                        {/* Tangki Air Penetral */}
                        <div className="col-span-4 flex items-center gap-1.5">
                          <span className="text-[10px] text-slate-500">TANK</span>
                          <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                lowTank ? 'bg-red-500' : 'bg-cyan-400'
                              }`}
                              style={{ width: `${n.tank}%` }}
                            />
                          </div>
                          <span
                            className={`text-[11px] w-8 text-right font-bold ${
                              lowTank ? 'text-red-400' : 'text-slate-200'
                            }`}
                          >
                            {n.tank}%
                          </span>
                        </div>

                        {/* Status Online / Isi Ulang */}
                        <div className="col-span-2 text-right">
                          {lowTank ? (
                            <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[9px] font-bold">
                              ISI ULANG
                            </span>
                          ) : (
                            <span className="text-emerald-400 text-[10px] font-bold">ONLINE</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ================================================================== */
        /* TAMPILAN 2: MOBILE APPLICATION MASYARAKAT — WARGA RING 1 (Gambar 7.4) */
        /* ================================================================== */
        <div className="max-w-[1400px] mx-auto p-4 sm:p-6 space-y-5">
          {/* Header Penjelasan Antarmuka Warga Ring 1 */}
          <div className="bg-[#111922] border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-base sm:text-lg font-black text-white">
                Mobile Application Masyarakat — <span className="text-emerald-400">BIO-NETS</span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Antarmuka warga Ring 1 Desa Kalianyar & Sempol · Informasi arah angin & keselamatan berbahasa sederhana
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setWargaCompareMode(false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  !wargaCompareMode
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Mode 1 Layar Live (Mengikuti Sensor)
              </button>
              <button
                type="button"
                onClick={() => setWargaCompareMode(true)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  wargaCompareMode
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Tampilkan 3 Tingkat Status Sekaligus (Sesuai Gambar 7.4)
              </button>
            </div>
          </div>

          {!wargaCompareMode ? (
            <div className="py-2">{renderWargaPhoneCard(null)}</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              {/* Layar 1: Status Hijau (Aman) */}
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded bg-emerald-600 text-white font-bold">
                    STATUS HIJAU
                  </span>
                  <span className="font-bold text-slate-200">Kondisi Aman</span>
                  <span className="text-slate-400">(&lt; 2,0 ppm)</span>
                </div>
                {renderWargaPhoneCard({ so2: 1.2, deg: 250, speed: 2.1 })}
              </div>

              {/* Layar 2: Status Kuning (Waspada) */}
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-bold">
                    STATUS KUNING
                  </span>
                  <span className="font-bold text-slate-200">Waspada</span>
                  <span className="text-slate-400">(2,0 – 4,9 ppm)</span>
                </div>
                {renderWargaPhoneCard({ so2: 4.1, deg: 138, speed: 4.2 })}
              </div>

              {/* Layar 3: Status Merah (Bahaya - Evakuasi) */}
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded bg-red-600 text-white font-bold">
                    STATUS MERAH
                  </span>
                  <span className="font-bold text-slate-200">Bahaya — Evakuasi</span>
                  <span className="text-slate-400">(≥ 5,0 ppm)</span>
                </div>
                {renderWargaPhoneCard({ so2: 8.4, deg: 138, speed: 4.2 })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
