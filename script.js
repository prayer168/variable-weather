const views = document.querySelectorAll(".view");
const navButtons = document.querySelectorAll(".nav-btn");

const waterInputs = {
  time: document.querySelector("#timeInput"),
  sun: document.querySelector("#sunInput"),
  humidity: document.querySelector("#humidityInput"),
  cool: document.querySelector("#coolInput")
};

const waterOutputs = {
  time: document.querySelector("#timeOutput"),
  sun: document.querySelector("#sunOutput"),
  humidity: document.querySelector("#humidityOutput"),
  cool: document.querySelector("#coolOutput")
};

const waterMeters = {
  evap: document.querySelector("#evapMeter"),
  cloud: document.querySelector("#cloudMeter"),
  rain: document.querySelector("#rainMeter"),
  dew: document.querySelector("#dewMeter")
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const rootStyle = document.documentElement.style;
const forecastStart = new Date(2026, 6, 19, 8, 0, 0);
const forecastHours = 96;
let typhoonTimer = null;
let typhoonPlaying = false;

function setView(id) {
  views.forEach((view) => view.classList.toggle("active", view.id === id));
  navButtons.forEach((button) => button.classList.toggle("active", button.dataset.view === id));
}

function getTimeState(value) {
  if (value < 22) return { label: "清晨", daylight: 0.48, night: 0.28, coolingBonus: 20 };
  if (value < 62) return { label: "白天", daylight: 1, night: 0, coolingBonus: 0 };
  if (value < 82) return { label: "傍晚", daylight: 0.55, night: 0.22, coolingBonus: 12 };
  return { label: "夜間", daylight: 0.12, night: 0.72, coolingBonus: 30 };
}

function updateWater() {
  const time = Number(waterInputs.time.value);
  const sun = Number(waterInputs.sun.value);
  const humidity = Number(waterInputs.humidity.value);
  const cool = Number(waterInputs.cool.value);
  const timeState = getTimeState(time);
  const effectiveSun = sun * timeState.daylight;
  const nightCooling = timeState.coolingBonus;
  const evaporation = clamp(Math.round((effectiveSun * 0.78) + (humidity * 0.14)), 0, 100);
  const cloud = clamp(Math.round((humidity * 0.52) + (cool * 0.35) + (nightCooling * 0.42)), 0, 100);
  const rain = clamp(Math.round((cloud * 0.58) + (evaporation * 0.25) + (cool * 0.18) - 22), 0, 100);
  const dew = clamp(Math.round((humidity * 0.58) + (nightCooling * 1.15) - (effectiveSun * 0.25)), 0, 100);
  const orographic = clamp(Math.round((humidity * 0.35) + (cool * 0.4)), 0, 100);

  waterOutputs.time.value = timeState.label;
  waterOutputs.sun.value = sun;
  waterOutputs.humidity.value = humidity;
  waterOutputs.cool.value = cool;
  waterMeters.evap.value = evaporation;
  waterMeters.cloud.value = cloud;
  waterMeters.rain.value = rain;
  waterMeters.dew.value = dew;

  rootStyle.setProperty("--night", timeState.night);
  rootStyle.setProperty("--stars", timeState.night > 0.4 ? 1 : timeState.night);
  rootStyle.setProperty("--sunOpacity", clamp(timeState.daylight * (0.35 + sun / 100), 0.05, 1));
  rootStyle.setProperty("--moonOpacity", timeState.night > 0.15 ? clamp(timeState.night + 0.15, 0, 1) : 0);
  rootStyle.setProperty("--thermalOpacity", 0.12 + effectiveSun / 95);
  rootStyle.setProperty("--vaporOpacity", 0.08 + evaporation / 92);
  rootStyle.setProperty("--cloudOpacity", 0.26 + cloud / 105);
  rootStyle.setProperty("--condensationOpacity", 0.08 + cloud / 100);
  rootStyle.setProperty("--rainOpacity", rain / 100);
  rootStyle.setProperty("--oroOpacity", orographic / 110);
  rootStyle.setProperty("--dewOpacity", dew / 100);
  rootStyle.setProperty("--cloudColor", rain > 65 ? "#d1d9df" : cloud > 55 ? "#eef2f3" : "#ffffff");

  let message = "水受熱蒸發成水蒸氣；水蒸氣遇到較冷的空氣會凝結成雲，雲中水滴變大就可能降雨。";
  if (timeState.label === "夜間" && dew >= 65) {
    message = "夜間地表散熱變冷，空氣中的水蒸氣容易在草地或物體表面凝結成露水。這不等於下雨，但同樣和水蒸氣遇冷有關。";
  } else if (rain >= 70) {
    message = "降雨可能很高：水蒸氣供應、濕度和冷卻都足夠，雲滴容易合併變大並落下。";
  } else if (cloud >= 65) {
    message = "成雲機會高：濕空氣上升後遇冷凝結，雲量會增加；若雲滴繼續變大，才會形成降雨。";
  } else if (evaporation >= 65) {
    message = "蒸發量高：白天日照讓水面提供更多水蒸氣，這是午後雲雨發展的重要材料。";
  } else if (humidity < 35) {
    message = "濕度偏低：空氣中的水蒸氣不足，就算有上升氣流，也不容易形成明顯雲雨。";
  }
  document.querySelector("#waterFeedback").textContent = message;
}

const mapFacts = {
  high: "高氣壓中心附近空氣較常下沉，雲較不容易發展；在北半球地面風大致呈順時針向外流動。",
  low: "低氣壓中心附近空氣較常上升，水蒸氣容易凝結成雲雨；在北半球地面風大致呈逆時針向內流動。",
  front: "冷鋒是較冷空氣推進到暖空氣下方的交界，常造成雲量增加、降雨、風向改變或氣溫下降。",
  rainband: "降雨區代表雲雨活動較明顯。若它與鋒面或低壓接近，天氣變化通常更劇烈。"
};

const mapLabels = {
  high: "高氣壓",
  low: "低氣壓",
  front: "冷鋒",
  rainband: "降雨區"
};

const typhoonRoutes = {
  "news-reference": {
    label: "新聞參考路徑",
    points: [{ x: 728, y: 500 }, { x: 650, y: 452 }, { x: 574, y: 418 }, { x: 482, y: 376 }, { x: 384, y: 332 }, { x: 286, y: 298 }],
    d: "M728 500 C668 452 620 434 574 418 C500 390 434 356 384 332 C344 316 314 304 286 298",
    hint: "模擬氣象新聞常見的預報圖：颱風由右下方海面逐日往臺灣南方接近，影響圈也跟著擴大。",
    hazard: 18
  },
  "graze-north": {
    label: "擦邊北轉",
    points: [{ x: 690, y: 430 }, { x: 552, y: 332 }, { x: 426, y: 246 }, { x: 548, y: 176 }, { x: 690, y: 118 }],
    d: "M690 430 C610 366 520 306 426 246 C500 198 604 156 690 118",
    hint: "颱風中心沿臺灣東側擦邊北上，再往右上方離開；東半部、北部和海面風浪要特別留意。",
    hazard: 8
  },
  "cross-island": {
    label: "穿越臺灣",
    points: [{ x: 704, y: 438 }, { x: 552, y: 370 }, { x: 410, y: 294 }, { x: 288, y: 222 }, { x: 164, y: 142 }],
    d: "M704 438 C594 390 498 334 410 294 C326 254 250 196 164 142",
    hint: "颱風中心由右下往左上穿越臺灣，山區豪雨、強風、停電和淹水風險都會升高。",
    hazard: 22
  },
  "south-graze": {
    label: "南側掠過",
    points: [{ x: 704, y: 438 }, { x: 560, y: 414 }, { x: 420, y: 392 }, { x: 282, y: 406 }, { x: 132, y: 420 }],
    d: "M704 438 C588 420 502 402 420 392 C330 388 232 410 132 420",
    hint: "颱風由右下往左下移動，外圍環流底部輕碰臺灣；南部、東南部與海邊長浪仍不可輕忽。",
    hazard: 10
  },
  "west-track": {
    label: "西側北上",
    points: [{ x: 652, y: 462 }, { x: 492, y: 410 }, { x: 318, y: 336 }, { x: 254, y: 220 }, { x: 240, y: 108 }],
    d: "M652 462 C526 430 398 384 318 336 C254 290 238 194 240 108",
    hint: "颱風從臺灣西南側北上，西半部與山區迎風面可能出現強降雨，沿海也要防強風。",
    hazard: 16
  },
  "east-offshore": {
    label: "東側外海",
    points: [{ x: 728, y: 426 }, { x: 650, y: 350 }, { x: 560, y: 288 }, { x: 560, y: 196 }, { x: 624, y: 104 }],
    d: "M728 426 C658 360 588 328 560 288 C534 238 568 164 624 104",
    hint: "颱風中心在東側外海北上，未必登陸，但外圍雨帶、長浪和東半部強風仍可能明顯。",
    hazard: 5
  }
};

let selectedMapTarget = "high";
const foundTargets = new Set();

function updateMapPrompt() {
  document.querySelector("#mapPrompt").textContent = `目前要找：${mapLabels[selectedMapTarget]}。點選圖上對應位置。`;
  document.querySelector("#mapScore").textContent = foundTargets.size;
}

function resetMap() {
  foundTargets.clear();
  document.querySelectorAll(".answer-zone").forEach((zone) => zone.classList.remove("found"));
  document.querySelector("#foundList").replaceChildren();
  updateMapPrompt();
}

function addFound(target) {
  if (foundTargets.has(target)) return;
  foundTargets.add(target);
  const item = document.createElement("li");
  item.textContent = `${mapLabels[target]}：${mapFacts[target]}`;
  document.querySelector("#foundList").append(item);
  updateMapPrompt();
}

function pointOnRoute(points, progress) {
  const segmentCount = points.length - 1;
  const scaled = clamp(progress, 0, 1) * segmentCount;
  const index = Math.min(Math.floor(scaled), segmentCount - 1);
  const local = scaled - index;
  const start = points[index];
  const end = points[index + 1];
  return {
    x: start.x + (end.x - start.x) * local,
    y: start.y + (end.y - start.y) * local
  };
}

function getForecastDate(progress) {
  return new Date(forecastStart.getTime() + progress * forecastHours * 60 * 60 * 1000);
}

function formatForecastDate(date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}月${day}日 ${hour}:${minute}`;
}

function svgEl(tag, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function makeTyphoonIcon(x, y, size = 1) {
  const icon = svgEl("g", {
    class: "forecast-typhoon-icon",
    transform: `translate(${x} ${y}) scale(${size})`
  });
  icon.append(
    svgEl("path", {
      class: "icon-core",
      d: "M-3 -20 C17 -20 30 -5 27 13 C24 27 13 38 -4 42 C3 30 2 19 -6 13 C-18 5 -18 -12 -3 -20 Z"
    }),
    svgEl("path", {
      class: "icon-core",
      d: "M5 22 C-11 34 -30 24 -31 6 C-31 -9 -22 -21 -7 -25 C-11 -15 -8 -6 2 -2 C14 3 16 15 5 22 Z"
    }),
    svgEl("circle", { class: "icon-eye", cx: "0", cy: "0", r: "6" })
  );
  return icon;
}

function formatMarkerLabel(progress) {
  const date = getForecastDate(progress);
  return `${date.getDate()}日上午`;
}

function renderForecastMarkers(route) {
  const markerLayer = document.querySelector("#forecastMarkers");
  const labeledProgress = [0, 0.25, 0.5, 0.75, 1];
  const labelOffsets = [
    { x: 52, y: -66 },
    { x: 56, y: -72 },
    { x: 52, y: -80 },
    { x: 46, y: -86 },
    { x: 50, y: -96 }
  ];
  const smallProgress = [0.08, 0.15, 0.19];
  const nodes = smallProgress.map((progress) => {
    const point = pointOnRoute(route.points, progress);
    return makeTyphoonIcon(point.x, point.y, 0.42);
  });

  labeledProgress.forEach((progress, index) => {
    const point = pointOnRoute(route.points, progress);
    const windRadius = 48 + index * 20;
    const coreRadius = 16 + index * 5;
    const offset = labelOffsets[index];
    const labelWidth = 96;
    const labelHeight = 34;
    const labelX = Math.min(point.x + offset.x, 684);
    const labelY = Math.max(point.y + offset.y, 22);
    const group = svgEl("g", { class: "forecast-marker" });
    const label = svgEl("g", { class: "forecast-label" });
    const text = svgEl("text", { x: labelX + 16, y: labelY + 24 });
    text.textContent = formatMarkerLabel(progress);
    label.append(
      svgEl("rect", { x: labelX, y: labelY, width: labelWidth, height: labelHeight, rx: 13 }),
      text
    );
    group.append(
      svgEl("circle", { class: "forecast-wind-radius", cx: point.x, cy: point.y, r: windRadius }),
      svgEl("circle", { class: "forecast-core-radius", cx: point.x, cy: point.y, r: coreRadius }),
      makeTyphoonIcon(point.x, point.y, 0.72 + index * 0.08),
      svgEl("line", {
        class: "forecast-leader",
        x1: labelX + 18,
        y1: labelY + labelHeight,
        x2: point.x + 6,
        y2: point.y - 8
      }),
      label
    );
    nodes.push(group);
  });

  markerLayer.replaceChildren(...nodes);
}

function getRouteStage(progress) {
  if (progress < 0.18) return "颱風位於臺灣東南方海面，外圍水氣逐漸接近。";
  if (progress < 0.42) return "外圍雲系接近臺灣，海面長浪與陣風開始變明顯。";
  if (progress < 0.68) return "颱風最接近臺灣，雨帶與強風影響最需要留意。";
  if (progress < 0.88) return "颱風逐漸遠離，但背風側與山區仍可能有殘餘降雨。";
  return "颱風離開臺灣附近海域，仍需留意長浪與後續降雨。";
}

function updateForecastReadout(progress) {
  const date = getForecastDate(progress);
  const leadHours = Math.round(progress * forecastHours);
  document.querySelector("#forecastTime").textContent = formatForecastDate(date);
  document.querySelector("#forecastLead").textContent = leadHours === 0 ? "預報起始" : `預報 +${leadHours} 小時`;
  document.querySelector("#forecastStage").textContent = getRouteStage(progress);
  document.querySelector("#distanceOutput").value = `+${leadHours}h`;
}

function setTyphoonPlaying(playing) {
  typhoonPlaying = playing;
  document.querySelector("#playTyphoon").classList.toggle("active", playing);
  if (!playing && typhoonTimer) {
    clearInterval(typhoonTimer);
    typhoonTimer = null;
  }
}

function playTyphoon({ restart = false } = {}) {
  if (restart) document.querySelector("#distanceInput").value = 0;
  setTyphoonPlaying(true);
  updateTyphoon();
  if (typhoonTimer) clearInterval(typhoonTimer);
  typhoonTimer = setInterval(() => {
    const input = document.querySelector("#distanceInput");
    const next = Math.min(100, Number(input.value) + 1);
    input.value = next;
    updateTyphoon();
    if (next >= 100) setTyphoonPlaying(false);
  }, 180);
}

function updateTyphoon() {
  const routeKey = document.querySelector("#routeInput").value;
  const route = typhoonRoutes[routeKey] || typhoonRoutes["news-reference"];
  const distance = Number(document.querySelector("#distanceInput").value);
  const strength = Number(document.querySelector("#strengthInput").value);
  document.querySelector("#strengthOutput").value = strength;
  const progress = distance / 100;

  const point = pointOnRoute(route.points, progress);
  const x = point.x;
  const y = point.y;
  const scale = 0.68 + strength / 160;
  const taiwanCenter = { x: 398, y: 304 };
  const centerDistance = Math.hypot(x - taiwanCenter.x, y - taiwanCenter.y);
  const proximity = clamp(100 - centerDistance / 3.05, 0, 100);
  const progressRisk = distance > 88 ? -6 : 0;
  const risk = clamp(Math.round(strength * 0.5 + proximity * 0.38 + route.hazard + progressRisk), 0, 100);
  document.querySelector("#stormTrack").setAttribute("d", route.d);
  renderForecastMarkers(route);
  document.querySelector("#stormGraphic").setAttribute("transform", `translate(${x} ${y}) scale(${scale})`);
  rootStyle.setProperty("--stormMoistureOpacity", 0.28 + strength / 130);
  rootStyle.setProperty("--surgeOpacity", clamp((strength + proximity - 70) / 100, 0.1, 0.82));
  rootStyle.setProperty("--floodRisk", clamp((risk - 30) / 70, 0.12, 0.9));
  rootStyle.setProperty("--mountainRisk", clamp((strength + proximity - 55) / 95, 0.1, 0.88));
  rootStyle.setProperty("--warningOpacity", clamp((risk - 25) / 75, 0.25, 1));
  document.querySelector("#routeHint").textContent = `${route.label}：${route.hint}`;
  updateForecastReadout(progress);

  let level = "低";
  let text = "目前直接影響較小，但仍應持續注意氣象資訊與海面長浪提醒。";
  if (risk >= 75) {
    level = "高";
    text = `${route.label}情境下強風、豪雨、長浪與淹水風險高。應避免外出，遠離海邊、河川、山區與地下道。`;
  } else if (risk >= 45) {
    level = "中等";
    text = `${route.label}情境下可能有明顯陣風與降雨。請固定戶外物品，準備照明、飲水與行動電源。`;
  }
  document.querySelector("#riskLevel").textContent = level;
  document.querySelector("#riskText").textContent = text;
}

function gradeQuiz(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const answers = {
    q1: "a",
    q2: "b",
    q3: "b",
    q4: "a",
    q5: "b",
    q6: "a",
    q7: "a",
    q8: "a",
    q9: "a",
    q10: "a"
  };
  const missing = Object.keys(answers).filter((key) => !data.get(key));
  const result = document.querySelector("#quizResult");
  if (missing.length) {
    result.textContent = `還有 ${missing.length} 題尚未作答。請檢查每一題都有選一個答案。`;
    return;
  }
  const score = Object.entries(answers).filter(([key, value]) => data.get(key) === value).length;
  if (score === 10) {
    result.textContent = "答對 10 題。你已能完整連結水循環、日夜凝結、天氣圖判讀與颱風防災判斷。";
  } else if (score >= 8) {
    result.textContent = `答對 ${score} 題。概念掌握得很好，可以再檢查錯題，說明自己判斷的理由。`;
  } else if (score >= 6) {
    result.textContent = `答對 ${score} 題。建議回到水與天氣、天氣圖活動，重新整理「凝結、低氣壓、鋒面」三個概念。`;
  } else {
    result.textContent = `答對 ${score} 題。建議先複習水循環和颱風防災，再重新挑戰一次。`;
  }
}

navButtons.forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));

document.querySelectorAll(".fact-tab").forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.fact;
    document.querySelectorAll(".fact-tab").forEach((tab) => {
      const active = tab === button;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll(".fact-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === target);
    });
  });
});

Object.values(waterInputs).forEach((input) => input.addEventListener("input", updateWater));
document.querySelector("#resetWater").addEventListener("click", () => {
  waterInputs.time.value = 35;
  waterInputs.sun.value = 70;
  waterInputs.humidity.value = 65;
  waterInputs.cool.value = 55;
  updateWater();
});

document.querySelectorAll(".tool").forEach((button) => {
  button.addEventListener("click", () => {
    selectedMapTarget = button.dataset.target;
    document.querySelectorAll(".tool").forEach((tool) => tool.classList.toggle("active", tool === button));
    updateMapPrompt();
  });
});

document.querySelectorAll(".answer-zone").forEach((zone) => {
  zone.addEventListener("click", () => {
    const answer = zone.dataset.answer;
    if (answer === selectedMapTarget) {
      zone.classList.add("found");
      addFound(answer);
    } else {
      document.querySelector("#mapPrompt").textContent = `這裡不是${mapLabels[selectedMapTarget]}。請觀察符號形狀、顏色或環流方向，再試一次。`;
    }
  });
});

document.querySelector("#resetMap").addEventListener("click", resetMap);

document.querySelector("#routeInput").addEventListener("change", () => {
  document.querySelector("#distanceInput").value = 0;
  playTyphoon({ restart: true });
});
document.querySelector("#distanceInput").addEventListener("input", () => {
  setTyphoonPlaying(false);
  updateTyphoon();
});
document.querySelector("#strengthInput").addEventListener("input", updateTyphoon);
document.querySelector("#playTyphoon").addEventListener("click", () => playTyphoon());
document.querySelector("#pauseTyphoon").addEventListener("click", () => setTyphoonPlaying(false));
document.querySelector("#restartTyphoon").addEventListener("click", () => playTyphoon({ restart: true }));
document.querySelectorAll("#actionGrid button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("#actionGrid button").forEach((choice) => choice.classList.remove("correct", "wrong"));
    const safe = button.dataset.safe === "true";
    button.classList.add(safe ? "correct" : "wrong");
    document.querySelector("#typhoonFeedback").textContent = safe
      ? "這是安全的防災行動。颱風來前先準備，可以降低強風、停電或停水造成的不便。"
      : "這個選擇有危險。颱風期間要遠離海邊、溪流、地下道和容易落石的山區。";
  });
});

document.querySelector("#quizForm").addEventListener("submit", gradeQuiz);
document.querySelector("#resetQuiz").addEventListener("click", () => {
  document.querySelector("#quizForm").reset();
  document.querySelector("#quizResult").textContent = "";
});

updateWater();
updateMapPrompt();
updateTyphoon();
