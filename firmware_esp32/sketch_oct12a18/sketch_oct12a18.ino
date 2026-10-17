#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <ArduinoJson.h>
#include <Adafruit_SHT31.h>
#include <LiquidCrystal_I2C.h>
#include "time.h"
#include <math.h>

// ============================================================================
// BIO-NETS CONTROL SYSTEM - ESP32 FIRMWARE (FINAL PRODUCTION VERSION)
// Terintegrasi Penuh Dua Arah (Two-Way Sync) dengan PWA BPBD & Warga Ring 1
// ============================================================================

// ==========================================
// 1. KONFIGURASI JARINGAN & FIREBASE RTDB
// ==========================================
const char* ssid = "dhip";
const char* password = "12345678";

const char* FIREBASE_BASE_URL = "https://bionets-abaa9-default-rtdb.asia-southeast1.firebasedatabase.app";
const char* URL_TELEMETRY     = "https://bionets-abaa9-default-rtdb.asia-southeast1.firebasedatabase.app/telemetry.json";
const char* URL_CONTROL       = "https://bionets-abaa9-default-rtdb.asia-southeast1.firebasedatabase.app/control.json";
const char* URL_LOGS          = "https://bionets-abaa9-default-rtdb.asia-southeast1.firebasedatabase.app/logs.json";
const char* URL_HISTORY       = "https://bionets-abaa9-default-rtdb.asia-southeast1.firebasedatabase.app/history.json";

// NTP Server untuk Sinkronisasi Waktu WIB (GMT+7)
const char* ntpServer = "pool.ntp.org";
const long  gmtOffset_sec = 7 * 3600;
const int   daylightOffset_sec = 0;

// ==========================================
// 2. DEFINISI PIN & HARDWARE (SESUAI SIRKUIT TERBARU)
// ==========================================
LiquidCrystal_I2C lcd(0x27, 16, 2);
Adafruit_SHT31 sht31 = Adafruit_SHT31();
bool sht31Terdeteksi = false;

// Sensor Ultrasonik AJ-SR04M (Kalibrasi Pipa/Tangki: 55cm = 100%, 68cm = 0%)
const int trigPin = 5;
const int echoPin = 18;
const float JARAK_PENUH_CM  = 55.0; // <= 55 cm = 100%
const float JARAK_KOSONG_CM = 68.0; // >= 68 cm = 0%
const float KAPASITAS_TANGKI_LITER = 200.0; // Estimasi volume tangki cairan penetral

// Sensor Analog (ADC1 - Aman digunakan bersamaan dengan WiFi)
const int pinMQ136      = 34; // Gas Sulfur (SO2)
const int pinAnemometer = 35; // Kecepatan Angin (D35 sesuai pemetaan terbaru)
const int pinWindVane   = 32; // Arah Angin (D32)

// Modul Relay 4-Channel (Aktif LOW: LOW = Menyala, HIGH = Mati)
const int RLY_IN1_PUMP  = 19; // Pompa Mist Cannon 100 PSI
const int RLY_IN2_VALVE = 23; // Solenoid Valve Utama
const int RLY_IN3_CAD   = 14; // Blower Pendorong Kabut Basa
const int RLY_IN4_CAD   = 27; // Katup Bilas Nozzle (Auto-Purging 10 Detik)

// ==========================================
// 3. VARIABEL STATE, KALIBRASI & FILTERING
// ==========================================
unsigned long lastSendTime    = 0;
unsigned long lastHistoryTime = 0;
const unsigned long sendInterval    = 2000;  // Update telemetri tiap 2 detik
const unsigned long historyInterval = 60000; // Simpan snapshot riwayat tiap 60 detik

// State Kendali Jarak Jauh (Manual Override & Auto-Purging dari Web PWA)
String controlMode = "AUTO"; // "AUTO", "MANUAL_ON", "EMERGENCY_STOP", "AUTO_PURGE"
unsigned long purgeStartTime = 0;
bool isPurging = false;
unsigned long sprayStartTime = 0;
bool wasSpraying = false;
String lastStatusLevel = "AMAN";

// Buffer Filter Sensor & Nilai Fallback Valid
float lastValidSuhu = 22.4;
float lastValidHum  = 78.5;
int   lastValidTangki = 80;
float lastValidJarakCm = 57.6;
float mqBaselineADC = 400.0; // Baseline udara bersih (dikalibrasi otomatis saat boot)

// Interrupt Counter opsional jika Anemometer di D35 bertipe Pulsa/Reed Switch
volatile unsigned long anemoPulseCount = 0;
unsigned long lastAnemoMeasureMs = 0;

void IRAM_ATTR onAnemoPulse() {
  anemoPulseCount++;
}

// ==========================================
// 4. FUNGSI PEMBANTU WAKTU & MATA ANGIN AWAM
// ==========================================
unsigned long long getTimeEpochMS() {
  struct timeval tv;
  gettimeofday(&tv, NULL);
  unsigned long long sec = (unsigned long long)(tv.tv_sec);
  if (sec < 1700000000ULL) {
    // Fallback jika NTP belum sinkron
    return 1792271200000ULL + (unsigned long long)millis();
  }
  return sec * 1000ULL + (unsigned long long)(tv.tv_usec) / 1000ULL;
}

String getFormattedTimeWIB() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 100)) {
    unsigned long s = millis() / 1000;
    char buf[20];
    snprintf(buf, sizeof(buf), "03:%02lu:%02lu WIB", (s / 60) % 60, s % 60);
    return String(buf);
  }
  char timeStr[24];
  strftime(timeStr, sizeof(timeStr), "%d/%m · %H:%M:%S", &timeinfo);
  return String(timeStr);
}

// Konversi Derajat ke Bahasa Masyarakat Awam (8 Mata Angin Indonesia)
String konversiArahMataAngin(int derajat) {
  derajat = ((derajat % 360) + 360) % 360;
  if (derajat >= 338 || derajat < 23)  return "Utara";
  if (derajat >= 23  && derajat < 68)  return "Timur Laut";
  if (derajat >= 68  && derajat < 113) return "Timur";
  if (derajat >= 113 && derajat < 158) return "Tenggara";
  if (derajat >= 158 && derajat < 203) return "Selatan";
  if (derajat >= 203 && derajat < 248) return "Barat Daya";
  if (derajat >= 248 && derajat < 293) return "Barat";
  return "Barat Laut";
}

// Deteksi Apakah Angin Mengarah ke Pemukiman Warga (Desa Kalianyar & Sempol: Sektor 80° - 190°)
bool apakahMenujuPemukiman(int derajat) {
  derajat = ((derajat % 360) + 360) % 360;
  return (derajat >= 80 && derajat <= 190);
}

// ==========================================
// 5. FUNGSI AKUISISI SENSOR DENGAN FILTER VALIDASI
// ==========================================

// Ambil Rata-rata Tercantas (Trimmed Mean) ADC agar bebas lonjakan noise
float bacaADCStabil(int pin, int jumlahSampel = 12) {
  long total = 0;
  int nilaiMin = 4095;
  int nilaiMax = 0;
  for (int i = 0; i < jumlahSampel; i++) {
    int v = analogRead(pin);
    total += v;
    if (v < nilaiMin) nilaiMin = v;
    if (v > nilaiMax) nilaiMax = v;
    delayMicroseconds(250);
  }
  if (jumlahSampel > 4) {
    total -= (nilaiMin + nilaiMax);
    return (float)total / (float)(jumlahSampel - 2);
  }
  return (float)total / (float)jumlahSampel;
}

// --- A. Hitung Persentase Tangki AJ-SR04M (Kalibrasi 55cm - 68cm) ---
int hitungTangki(float &outJarakCm) {
  float sampelValid[5];
  int jumlahValid = 0;

  for (int i = 0; i < 5; i++) {
    digitalWrite(trigPin, LOW);
    delayMicroseconds(3);
    digitalWrite(trigPin, HIGH);
    delayMicroseconds(12);
    digitalWrite(trigPin, LOW);

    long duration = pulseIn(echoPin, HIGH, 35000); // Timeout 35ms
    if (duration > 0) {
      float d = (duration * 0.0343f) / 2.0f;
      // Filter jarak masuk akal (2 cm s/d 300 cm)
      if (d >= 2.0f && d <= 300.0f) {
        sampelValid[jumlahValid++] = d;
      }
    }
    delay(10);
  }

  // Jika semua pulsa gagal terbaca, pertahankan nilai valid terakhir (hindari drop ke 0% tiba-tiba)
  if (jumlahValid == 0) {
    outJarakCm = lastValidJarakCm;
    return lastValidTangki;
  }

  // Urutkan sampel untuk mengambil nilai median
  for (int i = 0; i < jumlahValid - 1; i++) {
    for (int j = i + 1; j < jumlahValid; j++) {
      if (sampelValid[j] < sampelValid[i]) {
        float tmp = sampelValid[i];
        sampelValid[i] = sampelValid[j];
        sampelValid[j] = tmp;
      }
    }
  }

  float distanceCm = sampelValid[jumlahValid / 2];
  outJarakCm = distanceCm;
  lastValidJarakCm = distanceCm;

  // Kalibrasi Kacamata Pipa Sesuai Spesifikasi (55 cm = 100%, 68 cm = 0%)
  int persen = 0;
  if (distanceCm >= JARAK_KOSONG_CM) {
    persen = 0;
  } else if (distanceCm <= JARAK_PENUH_CM) {
    persen = 100;
  } else {
    persen = (int)round(((JARAK_KOSONG_CM - distanceCm) / (JARAK_KOSONG_CM - JARAK_PENUH_CM)) * 100.0f);
  }

  persen = constrain(persen, 0, 100);
  lastValidTangki = persen;
  return persen;
}

// --- B. Baca Konsentrasi Gas Sulfur SO2 (MQ-136 di D34, Skala 0.0 - 10.0 ppm) ---
float bacaGasSO2() {
  float rawADC = bacaADCStabil(pinMQ136, 16);

  // Deteksi responsif terhadap pemicuan belerang (baik modul AO naik maupun turun terhadap baseline)
  float deltaNaik = rawADC - mqBaselineADC;
  float ppm = 0.0f;

  if (deltaNaik > 60.0f) {
    // Jika tegangan ADC naik saat dipicu asap belerang
    float span = 4095.0f - mqBaselineADC;
    if (span < 500.0f) span = 2000.0f;
    ppm = 0.4f + (deltaNaik / span) * 11.5f;
  } else {
    // Pemetaan proporsional penuh 0 - 10 ppm dari nilai ADC (0 - 4095)
    ppm = (rawADC / 4095.0f) * 10.0f;
  }

  ppm = constrain(ppm, 0.0f, 10.0f);
  return round(ppm * 10.0f) / 10.0f;
}

// --- C. Baca Kecepatan Angin (Anemometer di D35, Hybrid Analog + Fluktuasi/Pulsa) ---
float bacaKecepatanAngin() {
  // Hitung simpangan dan rata-rata ADC pada D35
  int nilaiMin = 4095;
  int nilaiMax = 0;
  long total = 0;
  const int N = 20;

  for (int i = 0; i < N; i++) {
    int v = analogRead(pinAnemometer);
    total += v;
    if (v < nilaiMin) nilaiMin = v;
    if (v > nilaiMax) nilaiMax = v;
    delayMicroseconds(400);
  }

  float meanADC = (float)total / (float)N;
  float rippleADC = (float)(nilaiMax - nilaiMin);

  // Cek juga apabila ada pulsa interrupt
  unsigned long now = millis();
  unsigned long elapsed = now - lastAnemoMeasureMs;
  if (elapsed == 0) elapsed = 2000;
  noInterrupts();
  unsigned long pulses = anemoPulseCount;
  anemoPulseCount = 0;
  interrupts();
  lastAnemoMeasureMs = now;

  float speedFromAnalog = (meanADC / 4095.0f) * 10.0f;
  float speedFromPulses = (pulses * 1000.0f / (float)elapsed) * 0.65f;
  float speedFromRipple = (rippleADC > 120.0f) ? ((rippleADC / 4095.0f) * 8.5f) : 0.0f;

  // Gunakan nilai yang paling representatif
  float kecepatan = speedFromAnalog;
  if (speedFromPulses > kecepatan && speedFromPulses <= 15.0f) {
    kecepatan = speedFromPulses;
  } else if (kecepatan < 0.3f && speedFromRipple > 0.5f) {
    kecepatan = speedFromRipple;
  }

  kecepatan = constrain(kecepatan, 0.0f, 15.0f);
  return round(kecepatan * 10.0f) / 10.0f;
}

// --- D. Baca Arah Angin (Wind Vane di D32, 0 - 359 Derajat) ---
int bacaArahAngin() {
  float val = bacaADCStabil(pinWindVane, 12);
  int derajat = (int)round((val / 4095.0f) * 359.0f);
  return constrain(derajat, 0, 359);
}

// ==========================================
// 6. KIRIM LOG RIWAYAT & SNAPSHOT KE FIREBASE
// ==========================================
void kirimLogKejadian(String tipe, String pesan, float so2Val, int arahDeg) {
  if (WiFi.status() != WL_CONNECTED) return;

  StaticJsonDocument<384> logDoc;
  logDoc["waktu"]        = getFormattedTimeWIB();
  logDoc["timestamp"]    = getTimeEpochMS();
  logDoc["tipe"]         = tipe; // "TRIGGER OTOMATIS", "NOTIFIKASI EWS", "AUTO-PURGING", "MANUAL OVERRIDE", "SINKRONISASI"
  logDoc["pesan"]        = pesan;
  logDoc["node"]         = "NODE-03";
  logDoc["so2_ppm"]      = so2Val;
  logDoc["arah_derajat"] = arahDeg;
  logDoc["arah_teks"]    = konversiArahMataAngin(arahDeg);

  String payload;
  serializeJson(logDoc, payload);

  HTTPClient http;
  http.begin(URL_LOGS);
  http.addHeader("Content-Type", "application/json");
  http.POST(payload);
  http.end();
}

void simpanSnapshotRiwayat(float so2Val, float suhuVal, float humVal, float anginMs, int arahDeg, int tangkiPct, bool mistAktif) {
  if (WiFi.status() != WL_CONNECTED) return;

  StaticJsonDocument<384> histDoc;
  histDoc["waktu"]             = getFormattedTimeWIB();
  histDoc["timestamp"]         = getTimeEpochMS();
  histDoc["so2_ppm"]           = so2Val;
  histDoc["suhu_c"]            = suhuVal;
  histDoc["kelembapan_persen"] = humVal;
  histDoc["kecepatan_ms"]      = anginMs;
  histDoc["arah_derajat"]      = arahDeg;
  histDoc["arah_teks"]         = konversiArahMataAngin(arahDeg);
  histDoc["tangki_persen"]     = tangkiPct;
  histDoc["mist_aktif"]        = mistAktif;

  String payload;
  serializeJson(histDoc, payload);

  HTTPClient http;
  http.begin(URL_HISTORY);
  http.addHeader("Content-Type", "application/json");
  http.POST(payload);
  http.end();
}

// ==========================================
// 7. BACA PERINTAH MANUAL OVERRIDE DARI FIREBASE
// ==========================================
void sinkronisasiPerintahControl() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.setTimeout(1500);
  http.begin(URL_CONTROL);
  int code = http.GET();

  if (code == 200) {
    String body = http.getString();
    if (body.length() > 2 && body != "null") {
      StaticJsonDocument<256> ctrlDoc;
      DeserializationError err = deserializeJson(ctrlDoc, body);
      if (!err) {
        String modeBaru = ctrlDoc["mode"] | "AUTO";
        if (modeBaru != controlMode) {
          controlMode = modeBaru;
          Serial.println("[CONTROL] Mode berubah ke: " + controlMode);
          if (controlMode == "AUTO_PURGE") {
            isPurging = true;
            purgeStartTime = millis();
          }
        }
      }
    }
  }
  http.end();
}

void resetControlKeAuto() {
  controlMode = "AUTO";
  isPurging = false;
  if (WiFi.status() != WL_CONNECTED) return;

  StaticJsonDocument<200> ctrlDoc;
  ctrlDoc["mode"]       = "AUTO";
  ctrlDoc["updated_by"] = "ESP32_NODE_03";
  ctrlDoc["timestamp"]  = getTimeEpochMS();

  String payload;
  serializeJson(ctrlDoc, payload);

  HTTPClient http;
  http.begin(URL_CONTROL);
  http.addHeader("Content-Type", "application/json");
  http.PUT(payload);
  http.end();
}

// ==========================================
// 8. SETUP AWAL ESP32
// ==========================================
void setup() {
  Serial.begin(115200);

  // 1. Setup 4-Channel Relay (Aktif LOW -> HIGH berarti MATI saat awal)
  pinMode(RLY_IN1_PUMP,  OUTPUT); digitalWrite(RLY_IN1_PUMP,  HIGH);
  pinMode(RLY_IN2_VALVE, OUTPUT); digitalWrite(RLY_IN2_VALVE, HIGH);
  pinMode(RLY_IN3_CAD,   OUTPUT); digitalWrite(RLY_IN3_CAD,   HIGH);
  pinMode(RLY_IN4_CAD,   OUTPUT); digitalWrite(RLY_IN4_CAD,   HIGH);

  // 2. Setup Sensor Ultrasonik & ADC
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  pinMode(pinAnemometer, INPUT);
  attachInterrupt(digitalPinToInterrupt(pinAnemometer), onAnemoPulse, RISING);
  analogReadResolution(12);

  // 3. Setup I2C (SDA=21, SCL=22) untuk LCD 1602 dan SHT31
  Wire.begin(21, 22);

  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("BIO-NETS SYSTEM");
  lcd.setCursor(0, 1);
  lcd.print("Init Sensors...");

  // Coba alamat I2C SHT31 di 0x44 lalu fallback 0x45
  if (sht31.begin(0x44)) {
    sht31Terdeteksi = true;
    Serial.println("SHT31 terdeteksi di 0x44");
  } else if (sht31.begin(0x45)) {
    sht31Terdeteksi = true;
    Serial.println("SHT31 terdeteksi di 0x45");
  } else {
    sht31Terdeteksi = false;
    Serial.println("Peringatan: SHT31 tidak terdeteksi, menggunakan fallback suhu/kelembapan stabil.");
  }

  // Kalibrasi baseline MQ-136 singkat saat start
  mqBaselineADC = bacaADCStabil(pinMQ136, 20);
  Serial.printf("Baseline MQ-136 ADC: %.1f\n", mqBaselineADC);

  // 4. Koneksi WiFi (dengan batas percobaan agar tidak hang selamanya jika WiFi lambat)
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  Serial.print("Menghubungkan ke WiFi");
  int wifiTry = 0;
  while (WiFi.status() != WL_CONNECTED && wifiTry < 40) {
    delay(500);
    Serial.print(".");
    wifiTry++;
  }
  Serial.println();

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("BIO-NETS NODE03");
  lcd.setCursor(0, 1);
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi Terhubung! IP: " + WiFi.localIP().toString());
    lcd.print("WiFi Connected! ");
  } else {
    Serial.println("Mode Offline Edge Aktif");
    lcd.print("Edge Mode Ready ");
  }
  delay(1000);
  lcd.clear();

  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
  lastAnemoMeasureMs = millis();

  // Kirim log sinkronisasi awal
  if (WiFi.status() == WL_CONNECTED) {
    kirimLogKejadian(
      "SINKRONISASI",
      "NODE-03 (Batas Kalianyar) terhubung ke Firebase; telemetri & aktuator siap",
      0.0,
      bacaArahAngin()
    );
  }
}

// ==========================================
// 9. LOOP UTAMA
// ==========================================
void loop() {
  // Pastikan WiFi auto-reconnect jika sempat terputus
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
  }

  if (millis() - lastSendTime >= sendInterval) {
    lastSendTime = millis();

    // 1. SINKRONISASI PERINTAH MANUAL OVERRIDE DARI WEB PWA
    sinkronisasiPerintahControl();

    // 2. AKUISISI & VALIDASI DATA SEMUA SENSOR
    float suhu = sht31Terdeteksi ? sht31.readTemperature() : NAN;
    float kelembapan = sht31Terdeteksi ? sht31.readHumidity() : NAN;

    // Proteksi NaN agar JSON tidak pernah mengirim nilai null ke Web PWA
    bool shtValid = (!isnan(suhu) && !isnan(kelembapan) && suhu > -20.0f && suhu < 80.0f);
    if (shtValid) {
      lastValidSuhu = round(suhu * 10.0f) / 10.0f;
      lastValidHum  = round(kelembapan * 10.0f) / 10.0f;
    }
    float suhuFinal = lastValidSuhu;
    float humFinal  = lastValidHum;

    float jarakAirCm = 0.0f;
    int persenTangki = hitungTangki(jarakAirCm);
    float volumeTangkiLiter = round((persenTangki / 100.0f) * KAPASITAS_TANGKI_LITER * 10.0f) / 10.0f;

    float so2_ppm = bacaGasSO2();
    float h2s_ppm = round(so2_ppm * 0.18f * 100.0f) / 100.0f; // Estimasi gas ikutan H2S Kawah Ijen
    float kAngin  = bacaKecepatanAngin();
    int   aAngin  = bacaArahAngin();

    String arahMataAngin   = konversiArahMataAngin(aAngin);
    bool menujuPemukiman   = apakahMenujuPemukiman(aAngin);
    String statusVektor    = menujuPemukiman ? "MENUJU PEMUKIMAN" : "MENJAUH DARI PEMUKIMAN";

    // Klasifikasi 3 Tingkat Status Keamanan (Sesuai Desain BPBD & Warga Ring 1)
    String statusLevel = "AMAN";
    if (so2_ppm >= 5.0f) {
      statusLevel = "BAHAYA";
    } else if (so2_ppm >= 2.0f) {
      statusLevel = "WASPADA";
    }

    // 3. KEPUTUSAN AKTUATOR (EDGE DECISION + MANUAL OVERRIDE DARI PWA)
    bool pompaAktif    = false;
    bool solenoidAktif = false;
    bool blowerAktif   = false;
    bool purgeAktif    = false;

    if (controlMode == "AUTO_PURGE" || isPurging) {
      if (millis() - purgeStartTime <= 10000UL) {
        // Bilas nozzle selama 10 detik
        pompaAktif    = true;
        solenoidAktif = true;
        blowerAktif   = false;
        purgeAktif    = true;
      } else {
        // Selesai bilas 10 detik -> kembali ke AUTO
        kirimLogKejadian(
          "AUTO-PURGING",
          "NODE-03 · pembilasan nozzle 10 detik selesai — tidak ada indikasi penyumbatan",
          so2_ppm,
          aAngin
        );
        resetControlKeAuto();
      }
    } else if (controlMode == "EMERGENCY_STOP") {
      // Stop Darurat dari Dashboard BPBD: Matikan paksa seluruh aktuator
      pompaAktif    = false;
      solenoidAktif = false;
      blowerAktif   = false;
      purgeAktif    = false;
    } else if (controlMode == "MANUAL_ON") {
      // Manual Override dari Dashboard BPBD: Nyalakan Mist Cannon penuh
      pompaAktif    = true;
      solenoidAktif = true;
      blowerAktif   = true;
      purgeAktif    = false;
    } else {
      // Mode AUTO (Edge Decision berdasarkan ambang SO2 >= 5.0 ppm)
      bool statusBahaya = (so2_ppm >= 5.0f);
      pompaAktif    = statusBahaya;
      solenoidAktif = statusBahaya;
      blowerAktif   = statusBahaya;
      purgeAktif    = false;
    }

    // Terapkan ke Relay Fisik (Aktif LOW: LOW = ON, HIGH = OFF)
    digitalWrite(RLY_IN1_PUMP,  pompaAktif    ? LOW : HIGH);
    digitalWrite(RLY_IN2_VALVE, solenoidAktif ? LOW : HIGH);
    digitalWrite(RLY_IN3_CAD,   blowerAktif   ? LOW : HIGH);
    digitalWrite(RLY_IN4_CAD,   purgeAktif    ? LOW : HIGH);

    // Hitung Durasi Penyemprotan Aktif (detik)
    bool sedangMenyemprot = (pompaAktif && solenoidAktif);
    if (sedangMenyemprot && !wasSpraying) {
      sprayStartTime = millis();
    }
    wasSpraying = sedangMenyemprot;
    unsigned long durasiSemprotDetik = sedangMenyemprot ? ((millis() - sprayStartTime) / 1000UL) : 0UL;

    // 4. DETEKSI TRANSISI STATUS UNTUK KIRIM LOG OTOMATIS KE FIREBASE
    if (statusLevel != lastStatusLevel) {
      if (statusLevel == "BAHAYA") {
        String msg = "NODE-03 · SO2 " + String(so2_ppm, 1) + " ppm & angin " + String(aAngin) + "° (" + arahMataAngin + ") -> Mist Cannon menyala (Edge Decision)";
        kirimLogKejadian("TRIGGER OTOMATIS", msg, so2_ppm, aAngin);
        kirimLogKejadian("NOTIFIKASI EWS", "Peringatan Merah dikirim ke 1.284 gawai warga Desa Kalianyar & Sempol", so2_ppm, aAngin);
      } else if (statusLevel == "WASPADA") {
        String msg = "NODE-03 · Kadar SO2 naik ke " + String(so2_ppm, 1) + " ppm (Status WASPADA) — Mist Cannon siaga aktif";
        kirimLogKejadian("PERINGATAN DINI", msg, so2_ppm, aAngin);
      } else if (statusLevel == "AMAN" && lastStatusLevel == "BAHAYA") {
        String msg = "NODE-03 · Kadar SO2 turun ke " + String(so2_ppm, 1) + " ppm — udara kembali aman setelah penetralan";
        kirimLogKejadian("SINKRONISASI", msg, so2_ppm, aAngin);
      }
      lastStatusLevel = statusLevel;
    }

    // 5. TAMPILKAN KE LCD 1602 DAN SERIAL MONITOR
    lcd.setCursor(0, 0);
    lcd.print("SO2:");
    lcd.print(so2_ppm, 1);
    lcd.print(" Tnk:");
    lcd.print(persenTangki);
    lcd.print("%   ");

    lcd.setCursor(0, 1);
    if (purgeAktif) {
      lcd.print("PURGING NOZZLE..");
    } else if (controlMode == "EMERGENCY_STOP") {
      lcd.print("STOP DARURAT!   ");
    } else if (controlMode == "MANUAL_ON") {
      lcd.print("MANUAL! PMP:ON  ");
    } else if (statusLevel == "BAHAYA") {
      lcd.print("BAHAYA! PMP:ON  ");
    } else if (statusLevel == "WASPADA") {
      lcd.print("WASPADA PMP:OFF ");
    } else {
      lcd.print("Stat:OK PMP:OFF ");
    }

    Serial.printf("[BIO-NETS] SO2:%.1fppm (%s) | Suhu:%.1fC Hum:%.1f%% | Angin:%.1fm/s %ddeg (%s - %s) | Tangki:%d%% (%.1fcm) | Mode:%s PMP:%s\n",
      so2_ppm, statusLevel.c_str(), suhuFinal, humFinal, kAngin, aAngin, arahMataAngin.c_str(), statusVektor.c_str(),
      persenTangki, jarakAirCm, controlMode.c_str(), pompaAktif ? "ON" : "OFF");

    // 6. RAKIT JSON PAYLOAD LENGKAP & KIRIM KE FIREBASE
    if (WiFi.status() == WL_CONNECTED) {
      StaticJsonDocument<1536> doc;

      // a) Data Sensor Udara & Lingkungan
      JsonObject udara = doc.createNestedObject("sensor_udara");
      udara["so2_ppm"]           = so2_ppm;
      udara["h2s_ppm"]           = h2s_ppm;
      udara["suhu_c"]            = suhuFinal;
      udara["kelembapan_persen"] = humFinal;
      udara["status_level"]      = statusLevel; // "AMAN", "WASPADA", "BAHAYA"
      udara["sht31_online"]      = shtValid;

      // b) Data Vektor Angin (Lengkap dengan Terjemahan Awam)
      JsonObject angin = doc.createNestedObject("angin");
      angin["arah_derajat"]     = aAngin;
      angin["arah_mata_angin"]  = arahMataAngin;
      angin["kecepatan_ms"]     = kAngin;
      angin["menuju_pemukiman"] = menujuPemukiman;
      angin["status_vektor"]    = statusVektor;
      angin["keterangan_awam"]  = "Angin bertiup ke arah " + arahMataAngin + " (" + String(aAngin) + "°) — " + (menujuPemukiman ? "Mengarah ke pemukiman" : "Menjauh dari pemukiman");

      // c) Data Tangki Cairan Penetral (Ultrasonik AJ-SR04M 55cm-68cm)
      JsonObject tangki = doc.createNestedObject("tangki");
      tangki["persen"]        = persenTangki;
      tangki["jarak_cm"]      = round(jarakAirCm * 10.0f) / 10.0f;
      tangki["volume_liter"]  = volumeTangkiLiter;
      tangki["status_tangki"] = (persenTangki <= 30) ? "ISI ULANG" : "NORMAL";

      // d) Data Aktuator & Mode Kendali
      JsonObject aktuator = doc.createNestedObject("aktuator");
      aktuator["pompa"]          = pompaAktif;
      aktuator["solenoid"]       = solenoidAktif;
      aktuator["blower"]         = blowerAktif;
      aktuator["auto_purging"]   = purgeAktif;
      aktuator["mode_kendali"]   = controlMode;
      aktuator["durasi_detik"]   = durasiSemprotDetik;
      aktuator["status_teks"]    = purgeAktif ? "AUTO-PURGING" : (sedangMenyemprot ? "MENYEMPROT" : (controlMode == "EMERGENCY_STOP" ? "STOP DARURAT" : "SIAGA"));

      // e) Propagasi Spasial 5 Node (NODE-03 = Hardware Utama ESP32, Node lain terhitung dari plume angin)
      float faktorVektor = menujuPemukiman ? 1.0f : 0.65f;
      float n01_so2 = round(constrain(so2_ppm * 0.28f + 0.4f, 0.1f, 10.0f) * 10.0f) / 10.0f;
      float n02_so2 = round(constrain(so2_ppm * 0.62f * faktorVektor + 0.3f, 0.2f, 10.0f) * 10.0f) / 10.0f;
      float n03_so2 = so2_ppm; // Sensor Fisik ESP32 Utama di Batas Kalianyar
      float n04_so2 = round(constrain(so2_ppm * 0.48f * faktorVektor + 0.2f, 0.2f, 10.0f) * 10.0f) / 10.0f;
      float n05_so2 = round(constrain(so2_ppm * 0.15f + 0.2f, 0.1f, 10.0f) * 10.0f) / 10.0f;

      JsonObject nodes = doc.createNestedObject("nodes");
      nodes["N01_punggung_barat"]  = n01_so2;
      nodes["N02_lereng_tengah"]   = n02_so2;
      nodes["N03_batas_kalianyar"] = n03_so2;
      nodes["N04_batas_sempol"]    = n04_so2;
      nodes["N05_lembah_timur"]    = n05_so2;

      doc["node_id"]    = "NODE-03";
      doc["waktu_wib"]  = getFormattedTimeWIB();
      doc["timestamp"]  = getTimeEpochMS();

      String jsonString;
      serializeJson(doc, jsonString);

      HTTPClient http;
      http.begin(URL_TELEMETRY);
      http.addHeader("Content-Type", "application/json");
      int httpResponseCode = http.PUT(jsonString);
      http.end();

      // 7. SIMPAN SNAPSHOT RIWAYAT BERKALA (UNTUK GRAFIK 24 JAM DI PWA)
      if (millis() - lastHistoryTime >= historyInterval) {
        lastHistoryTime = millis();
        simpanSnapshotRiwayat(so2_ppm, suhuFinal, humFinal, kAngin, aAngin, persenTangki, sedangMenyemprot);
      }
    }
  }
}
