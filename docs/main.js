/* 히어로 와이어프레임
   앱이 별 프리즘을 만들 때 쓰는 것과 같은 계산으로 꼭짓점을 만들고,
   직접 투영해서 모서리만 그린다. 분홍 = 앱에서 '집어서 고른' 모서리. */
(function () {
  'use strict';

  var cv = document.getElementById('wire');
  if (!cv) return;
  var ctx = cv.getContext('2d');

  var POINTS = 5, OUTER = 1, INNER = 0.42, HALF = 0.19;

  // 위/아래 링 꼭짓점 (별 외곽선을 두께만큼 밀어 올린 형태)
  var V = [], top = [], bot = [], i;
  for (i = 0; i < POINTS * 2; i++) {
    var a = i / (POINTS * 2) * Math.PI * 2 - Math.PI / 2;
    var r = (i % 2 === 0) ? OUTER : INNER;
    var x = Math.cos(a) * r, z = Math.sin(a) * r;
    top.push(V.push([x, HALF, z]) - 1);
    bot.push(V.push([x, -HALF, z]) - 1);
  }

  var N = POINTS * 2, E = [];
  for (i = 0; i < N; i++) {
    E.push([top[i], top[(i + 1) % N], 'top' + i]);   // 윗면 외곽선
    E.push([bot[i], bot[(i + 1) % N], 'bot']);       // 아랫면 외곽선
    E.push([top[i], bot[i], 'side']);                // 옆면 세로선
  }
  // 별 끝 하나에서 만나는 윗면 모서리 두 개 = 한 번 클릭하면 잡히는 체인
  var PICKED = { 'top0': 1 };
  PICKED['top' + (N - 1)] = 1;

  var W = 0, H = 0;
  function size() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var r = cv.getBoundingClientRect();
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  if (window.ResizeObserver) new ResizeObserver(size).observe(cv);
  else window.addEventListener('resize', size);
  size();

  var rootStyle = getComputedStyle(document.documentElement);
  function token(name) { return rootStyle.getPropertyValue(name).trim(); }

  var still = window.matchMedia('(prefers-reduced-motion:reduce)');

  function frame(t) {
    var ang = still.matches ? 0.72 : t / 4200;   // 정지 선호 시 보기 좋은 각도로 고정
    var tilt = -0.74;
    var ca = Math.cos(ang), sa = Math.sin(ang);
    var ct = Math.cos(tilt), st = Math.sin(tilt);
    var scale = Math.min(W, H) * 0.39, cz = 3.2;

    var P = V.map(function (v) {
      var rx = v[0] * ca - v[2] * sa, rz = v[0] * sa + v[2] * ca;   // Y축 회전
      var ry = v[1] * ct - rz * st, rz2 = v[1] * st + rz * ct;      // X축 기울임
      var d = cz / (cz + rz2);                                      // 원근
      return [W / 2 + rx * scale * d, H / 2 - ry * scale * d, rz2];
    });

    ctx.clearRect(0, 0, W, H);
    var ink = token('--ink'), sel = token('--sel'), zc = token('--z');

    // 뒤쪽 모서리부터 그려서 앞선이 위로 오게
    var order = E.map(function (e, idx) {
      return [idx, (P[e[0]][2] + P[e[1]][2]) / 2];
    }).sort(function (a, b) { return b[1] - a[1]; });

    ctx.lineCap = 'round';
    for (i = 0; i < order.length; i++) {
      var e = E[order[i][0]];
      var depth = (P[e[0]][2] + P[e[1]][2]) / 2;
      var near = 1 - Math.min(Math.max((depth + 1.1) / 2.2, 0), 1);   // 앞쪽=1
      var picked = PICKED[e[2]] === 1;
      ctx.globalAlpha = picked ? 0.45 + near * 0.55 : 0.13 + near * 0.42;
      ctx.strokeStyle = picked ? sel : ink;
      ctx.lineWidth = picked ? 2.6 : 1.15;
      ctx.beginPath();
      ctx.moveTo(P[e[0]][0], P[e[0]][1]);
      ctx.lineTo(P[e[1]][0], P[e[1]][1]);
      ctx.stroke();
    }

    // 꼭짓점
    ctx.fillStyle = zc;
    for (i = 0; i < P.length; i++) {
      var n2 = 1 - Math.min(Math.max((P[i][2] + 1.1) / 2.2, 0), 1);
      ctx.globalAlpha = 0.2 + n2 * 0.6;
      ctx.beginPath();
      ctx.arc(P[i][0], P[i][1], 1.9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (!still.matches) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
  // 사용자가 도중에 '동작 줄이기'를 켜고 끌 때도 그림이 맞게 갱신되도록
  if (still.addEventListener) {
    still.addEventListener('change', function () { requestAnimationFrame(frame); });
  }
})();
