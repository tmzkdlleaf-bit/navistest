/* ================================================================= */
/*  Radar.js — 레이더(방사형) 차트 렌더링                               */
/*                                                                   */
/*  이 파일이 담당하는 일:                                             */
/*  · .stats-wrapper[data-stats] 속성을 읽어 레이더 차트를 SVG로 그림  */
/*  · 마우스를 올리면 능력치 수치를 툴팁으로 표시                       */
/*                                                                   */
/*  사용 방법:                                                        */
/*  HTML에 아래 구조가 있어야 합니다:                                   */
/*  <div class="stats-wrapper"                                        */
/*       data-stats="60,55,50,65,70,60,55,50"                        */
/*       data-color="200, 200, 200">                                  */
/*    <div class="radar-chart-container">                             */
/*      <svg class="radar-chart" viewBox="0 0 200 200"></svg>         */
/*    </div>                                                          */
/*  </div>                                                            */
/*                                                                   */
/*  공개 함수:                                                        */
/*  · window.drawAllRadarCharts(root?) — 페이지의 모든 차트를 그림     */
/*  · window.drawRadarChart(svgEl)     — SVG 요소 하나만 다시 그림     */
/*                                                                   */
/*  ⚠️  이 파일은 수정할 필요가 거의 없습니다.                           */
/*  차트 레이블은 Config.js의 STAT_LABELS 배열에서 수정하세요.           */
/* ================================================================= */

(function () {
    'use strict';

    /* ─────────────────────────────────────────────────────────────
       상수 정의
    ───────────────────────────────────────────────────────────── */

    /* 능력치 레이블 (Config.js의 STAT_LABELS와 순서가 일치해야 합니다) */
    /* ✏️  레이블을 바꾸려면 Config.js의 STAT_LABELS를 수정하세요 */
    var LABELS = ['근력', '건강', '크기', '민첩', '외모', '지능', '정신', '교육'];

    var N      = 8;                    /* 꼭짓점(능력치) 개수 */
    var CX     = 100;                  /* SVG 중심점 X 좌표 */
    var CY     = 100;                  /* SVG 중심점 Y 좌표 */
    var R      = 72;                   /* 차트 최대 반지름 (px) */
    var STEP   = (Math.PI * 2) / N;   /* 꼭짓점 간 각도 간격 (라디안) */
    var OFFSET = -Math.PI / 2;         /* 시작 각도: -90도(12시 방향) */


    /* ─────────────────────────────────────────────────────────────
       유틸리티 함수
    ───────────────────────────────────────────────────────────── */

    /**
     * SVG 네임스페이스(namespace)로 요소를 생성하는 헬퍼 함수.
     * 일반 createElement와 달리 SVG 전용 네임스페이스가 필요합니다.
     *
     * 매개변수:
     *   tag   : 생성할 SVG 태그 이름 ('line', 'polygon', 'text' 등)
     *   attrs : 설정할 속성 객체 (key-value)
     *
     * 반환값: SVGElement
     */
    function el(tag, attrs) {
        var element = document.createElementNS('http://www.w3.org/2000/svg', tag);
        if (attrs) {
            Object.entries(attrs).forEach(function (pair) {
                element.setAttribute(pair[0], pair[1]);
            });
        }
        return element;
    }

    /**
     * i번째 꼭짓점의 (x, y) 좌표를 계산합니다.
     * 중심에서 r만큼 떨어진 위치를 원형 배치로 계산합니다.
     *
     * 매개변수:
     *   i : 꼭짓점 인덱스 (0 ~ N-1)
     *   r : 중심에서의 거리 (0 ~ R)
     *
     * 반환값: { x, y }
     */
    function pt(i, r) {
        var angle = STEP * i + OFFSET; /* 이 꼭짓점의 각도 */
        return {
            x: CX + r * Math.cos(angle),
            y: CY + r * Math.sin(angle),
        };
    }

    /**
     * 능력치 배열을 SVG polygon의 points 문자열로 변환합니다.
     * 각 수치(0~100)를 반지름 비율로 변환합니다.
     *
     * 매개변수:
     *   radiiArr : 각 꼭짓점의 실제 반지름 배열 (이미 비율 변환된 값)
     *
     * 반환값: "x1,y1 x2,y2 ..." 형식의 points 문자열
     */
    function toPoints(radiiArr) {
        return radiiArr.map(function (r, i) {
            var p = pt(i, r);
            return p.x + ',' + p.y;
        }).join(' ');
    }


    /* ─────────────────────────────────────────────────────────────
       핵심 함수: 차트 하나 그리기
    ───────────────────────────────────────────────────────────── */

    /**
     * .stats-wrapper 요소 하나를 받아 내부 SVG에 차트를 그립니다.
     * 레이어 순서:
     *   1. 배경 격자 (동심 다각형 + 축선)
     *   2. 데이터 폴리곤 (반투명 채우기 + 테두리)
     *   3. 능력치 레이블 텍스트
     *   4. 데이터 포인트 (작은 원)
     *   5. 마우스 오버 툴팁
     *
     * 매개변수:
     *   wrapper : .stats-wrapper 클래스를 가진 div 요소
     */
    function drawOne(wrapper) {

        /* ① SVG 요소 찾기 (없으면 컨테이너 안에 새로 생성) */
        var svg = wrapper.querySelector('svg.radar-chart');
        if (!svg) {
            svg = el('svg', { viewBox: '0 0 200 200', class: 'radar-chart' });
            var container = wrapper.querySelector('.radar-chart-container') || wrapper;
            container.appendChild(svg);
        }
        svg.setAttribute('viewBox', '0 0 200 200');

        /* ② data-stats 속성 파싱 (쉼표로 구분된 8개 숫자) */
        /*    값은 0~100 범위로 제한합니다 */
        var rawStats = wrapper.getAttribute('data-stats') || '50,50,50,50,50,50,50,50';
        var stats    = rawStats.split(',').map(function (s) {
            return Math.min(100, Math.max(0, parseFloat(s.trim()) || 0));
        });

        /* ③ data-color 속성 파싱 ('R, G, B' 형식) */
        var rawColor = (wrapper.getAttribute('data-color') || '200, 200, 200').trim();

        /* ④ SVG 내용 초기화 (이전 차트 완전 삭제) */
        svg.innerHTML = '';

        /* ── 레이어 1: 배경 격자 ── */
        /*
         * 배경에 5단계 동심 다각형과 8개 축선을 그립니다.
         * 이것은 단순히 시각적 참조선이며 데이터와 무관합니다.
         */
        var bgGroup = el('g', { class: 'chart-background' });

        /* 5단계 동심 다각형 (20%, 40%, 60%, 80%, 100% 레벨) */
        for (var lv = 1; lv <= 5; lv++) {
            var levelRadius = (R / 5) * lv; /* 각 레벨의 반지름 */
            var levelPts    = Array.from({ length: N }, function (_, i) {
                var p = pt(i, levelRadius);
                return p.x + ',' + p.y;
            }).join(' ');

            bgGroup.appendChild(el('polygon', {
                points:       levelPts,
                fill:         'none',
                stroke:       'rgba(255,255,255,0.08)',
                'stroke-width': lv === 5 ? '1' : '0.5', /* 외곽선만 조금 더 굵게 */
            }));
        }

        /* 중심에서 각 꼭짓점까지 축선 그리기 */
        for (var axisI = 0; axisI < N; axisI++) {
            var axisEnd = pt(axisI, R);
            bgGroup.appendChild(el('line', {
                x1: CX, y1: CY, x2: axisEnd.x, y2: axisEnd.y,
                stroke:         'rgba(255,255,255,0.08)',
                'stroke-width': '0.5',
            }));
        }

        svg.appendChild(bgGroup);

        /* ── 레이어 2: 데이터 폴리곤 ── */
        /*
         * 각 능력치를 0~100 → 0~R 으로 변환해서
         * 반투명 다각형으로 표시합니다.
         */
        var radiiArr = stats.map(function (v) { return (v / 100) * R; });

        var dataGroup   = el('g', { class: 'chart-data' });
        var dataPolygon = el('polygon', {
            points:              toPoints(radiiArr),
            fill:                'rgba(' + rawColor + ', 0.20)', /* 반투명 채우기 */
            stroke:              'rgb(' + rawColor + ')',         /* 테두리 */
            'stroke-width':      '1.5',
            'stroke-linejoin':   'round',
        });
        dataGroup.appendChild(dataPolygon);
        svg.appendChild(dataGroup);

        /* ── 레이어 3: 능력치 레이블 ── */
        /*
         * 각 꼭짓점 바깥쪽에 능력치 이름(근력, 건강, ...)을 표시합니다.
         * R + 17: 차트 외곽에서 17px 더 바깥쪽에 배치
         */
        var labelsGroup = el('g', { class: 'chart-labels' });
        LABELS.forEach(function (labelText, i) {
            var labelPos = pt(i, R + 17);
            var labelEl  = el('text', {
                x:                    labelPos.x,
                y:                    labelPos.y,
                'text-anchor':        'middle',
                'dominant-baseline':  'middle',
                'font-size':          '9.5',
                'font-weight':        'bold',
                fill:                 '#777',
            });
            labelEl.textContent = labelText;
            labelsGroup.appendChild(labelEl);
        });
        svg.appendChild(labelsGroup);

        /* ── 레이어 4 & 5: 데이터 포인트 + 툴팁 ── */
        /*
         * 각 꼭짓점에 작은 원(circle)을 배치합니다.
         * 보이는 원(반지름 3.5) + 투명한 히트박스(반지름 13)를 함께 만들어
         * 마우스가 근처에만 와도 툴팁이 잘 뜨도록 합니다.
         */
        var dotsGroup = el('g', { class: 'chart-dots' });

        radiiArr.forEach(function (r, i) {
            var dotPos = pt(i, r);

            /* 눈에 보이는 점 */
            dotsGroup.appendChild(el('circle', {
                cx:             dotPos.x,
                cy:             dotPos.y,
                r:              '3.5',
                fill:           'rgb(' + rawColor + ')',
                stroke:         '#1a1a1a',
                'stroke-width': '1.2',
            }));

            /* 투명 히트박스 (마우스 감지 범위를 넓히기 위해) */
            var hitbox = el('circle', {
                cx:    dotPos.x,
                cy:    dotPos.y,
                r:     '13',
                fill:  'transparent',
                class: 'dot-hit',
                style: 'cursor:pointer',
            });
            /* 나중에 툴팁에서 읽을 수 있도록 데이터 저장 */
            hitbox.dataset.label = LABELS[i];
            hitbox.dataset.value = Math.round(stats[i]);
            hitbox.dataset.cx    = dotPos.x;
            hitbox.dataset.cy    = dotPos.y;
            dotsGroup.appendChild(hitbox);
        });

        svg.appendChild(dotsGroup);

        /* ── 레이어 5: 툴팁 ── */
        /*
         * 마우스를 점 위에 올리면 '능력치명: 값' 형식으로 표시합니다.
         * 초기에는 display:none 상태이고, 마우스오버 이벤트로 표시합니다.
         */
        var tooltipGroup = el('g', {
            class: 'chart-tooltip',
            style: 'display:none; pointer-events:none',
        });

        /* 툴팁 배경 사각형 */
        var tooltipRect = el('rect', {
            rx:             '4',
            ry:             '4',
            fill:           'rgba(10,10,10,0.92)',
            stroke:         'rgba(' + rawColor + ', 0.6)',
            'stroke-width': '1',
        });

        /* 툴팁 텍스트 */
        var tooltipText = el('text', {
            'text-anchor':      'middle',
            'dominant-baseline': 'central',
            'font-size':        '11',
            'font-weight':      'bold',
            fill:               '#ddd',
            'paint-order':      'stroke',
            stroke:             'rgba(0,0,0,0.6)',
            'stroke-width':     '3',
        });

        tooltipGroup.appendChild(tooltipRect);
        tooltipGroup.appendChild(tooltipText);
        svg.appendChild(tooltipGroup);

        /* ── 마우스오버 이벤트 처리 ── */
        /*
         * 이벤트 위임(event delegation) 방식으로 dotsGroup에만 리스너를 붙입니다.
         * N개의 히트박스마다 리스너를 붙이는 것보다 효율적입니다.
         */
        dotsGroup.addEventListener('mouseover', function (e) {
            var target = e.target;
            if (!target.classList.contains('dot-hit')) return;

            var label    = target.dataset.label; /* 능력치 이름 */
            var value    = target.dataset.value; /* 능력치 수치 */
            var hoverX   = parseFloat(target.dataset.cx);
            var hoverY   = parseFloat(target.dataset.cy);
            var content  = label + ': ' + value;

            /* 툴팁 텍스트 설정 */
            tooltipText.textContent = content;

            /* 툴팁 크기 계산 (글자 수 기반 근사치) */
            var tW = content.length * 6.8 + 20;
            var tH = 22;

            /* 배경 사각형 크기 및 위치 설정 (텍스트 중심 기준) */
            tooltipRect.setAttribute('width',  tW);
            tooltipRect.setAttribute('height', tH);
            tooltipRect.setAttribute('x',      -(tW / 2));
            tooltipRect.setAttribute('y',      -(tH / 2));

            /* 툴팁이 SVG 위쪽 경계를 벗어나지 않도록 위아래 조정 */
            var tooltipY = hoverY < 30 ? hoverY + 28 : hoverY - 28;
            tooltipGroup.setAttribute('transform', 'translate(' + hoverX + ', ' + tooltipY + ')');
            tooltipGroup.style.display = '';
        });

        /* 마우스가 히트박스를 벗어나면 툴팁 숨기기 */
        dotsGroup.addEventListener('mouseout', function (e) {
            if (e.target.classList.contains('dot-hit')) {
                tooltipGroup.style.display = 'none';
            }
        });
    }


    /* ─────────────────────────────────────────────────────────────
       공개 API 등록
    ───────────────────────────────────────────────────────────── */

    /**
     * 페이지(또는 지정한 루트 요소) 안의 모든 .stats-wrapper 를 찾아
     * 레이더 차트를 그립니다.
     *
     * 매개변수:
     *   root : (선택 사항) 검색할 루트 요소. 생략하면 document 전체를 검색합니다.
     *
     * 사용 예:
     *   drawAllRadarCharts();                    // 전체 페이지
     *   drawAllRadarCharts(someSection);         // 특정 섹션만
     */
    window.drawAllRadarCharts = function (root) {
        (root || document).querySelectorAll('.stats-wrapper').forEach(drawOne);
    };

    /**
     * SVG 요소를 받아 그 부모 .stats-wrapper 의 차트를 다시 그립니다.
     * 특정 차트 하나만 업데이트할 때 사용합니다.
     *
     * 매개변수:
     *   svgElement : 다시 그릴 SVG 요소
     */
    window.drawRadarChart = function (svgElement) {
        var wrapper = svgElement && svgElement.closest('.stats-wrapper');
        if (wrapper) drawOne(wrapper);
    };

})(); /* IIFE (즉시 실행 함수) — 내부 변수가 전역을 오염시키지 않도록 */
