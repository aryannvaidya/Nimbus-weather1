# Nimbus Black🌤️
### *Real-time weather, beautifully simple.* 

![Static Badge](https://img.shields.io/badge/License-MIT-green?style=flat-square)
![Static Badge](https://img.shields.io/badge/PWA-Ready-purple?style=flat-square)
![Static Badge](https://img.shields.io/badge/AQI-India_NAQI-orange?style=flat-square)

Nimbus weather is a clean, dark-themed weather PWA featuring real-time weather, India-standard air quality, and a polished mobile-first UI.

---

## ✨ Features

- 🌡️ **Real-time weather** — temperature, humidity, precipitation, visibility
- 💨 **India NAQI Air Quality** — 6-level scale per CPCB standard with pollutant breakdown (PM2.5, PM10, NO₂, SO₂, O₃, CO)
- 🌅 **Live sunrise/sunset arc** — animated sun position synced to local timezone
- 🧭 **Wind compass** — SVG compass with Beaufort scale labels
- 🏙️ **Multi-city navigation** — swipe left/right to switch cities
- 📳 **Haptic feedback** — tactile response
- ⚙️ **Settings** — customizable thresholds for rain and snow alerts



---

## Screenshots

<div align="left">

<img src="screenshot/main.jpg" width="30%"/>
&nbsp;
<img src="screenshot/forecasts.jpg" width="30%"/>
&nbsp;
<img src="screenshot/Radar.jpg" width="30%"/>

<br/><br/>

<img src="screenshot/aqi.jpg" width="30%"/>
&nbsp;
<img src="screenshot/cards.jpg" width="30%"/>
&nbsp;
<img src="screenshot/manage.jpg" width="30%"/>

</div>

## 🛠️ Built With

| Tool | Purpose |
|------|---------|
| HTML / CSS / Vanilla JS | Core app — no frameworks |
| Gemini 2.0 | AI-assisted development |
| Open-Meteo API | Weather + sunrise/sunset data |
| WAQI API | Air quality (India NAQI) |
| Chart.js | Forecast charts |
| Leaflet.js | Weather map tiles |

---

## 📡 Data Sources

| Data | Source |
|------|--------|
| Weather | [Open-Meteo](https://open-meteo.com) — free, no key needed |
| Air Quality | [WAQI](https://waqi.info) — India NAQI (CPCB standard) |
| Sunrise/Sunset | Open-Meteo Daily Forecast |
| Geolocation | Browser Geolocation API |

---

## 🇮🇳 India NAQI Scale

| Range | Category | Color |
|-------|----------|-------|
| 0–50 | Good | 🟢 |
| 51–100 | Satisfactory | 🟡 |
| 101–200 | Moderate | 🟡 |
| 201–300 | Poor | 🟠 |
| 301–400 | Very Poor | 🔴 |
| 401–500 | Severe | 🟣 |

---

## 🚀 Getting Started

This is a single-file static web app. No build tools, no npm, no setup.

**Option 1 — Open directly:**
```
Just open index.html in any browser.
```

**Option 2 — Deploy to Vercel:**
1. Fork this repo
2. Go to [vercel.com](https://vercel.com)
3. Import the repo → leave all settings default → Deploy

---

## 📁 Project Structure

```
vayu-weather/
│
└── index.html       # Entire app — HTML + CSS + JS in one file
└── README.md
```

---

## 🙏 Acknowledgements

- [Open-Meteo](https://open-meteo.com) — for providing free, open-source weather data
- [WAQI](https://waqi.info) — for global air quality data
- [CPCB India](https://cpcb.nic.in) — for the National AQI standard

---

## 📄 License

This project is licensed under the MIT License.

