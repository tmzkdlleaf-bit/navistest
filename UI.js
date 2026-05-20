/* ================================================================= */
/*  UI.js — 사용자 인터페이스 헬퍼 함수 모음                            */
/*                                                                   */
/*  이 파일이 담당하는 일:                                             */
/*  1. 탭 전환 (openTab, changePhase)                                  */
/*  2. 홈 이미지 슬라이더                                              */
/*  3. 모달 열기 / 닫기                                               */
/*  4. 이미지 라이트박스 (클릭해서 크게 보기)                           */
/*  5. 라이트/다크 테마 토글                                           */
/*  6. 배경 먼지 파티클 효과                                           */
/*  7. NPC 관계 배지 색상 자동 칠하기                                  */
/*  8. 세션 로그 텍스트 파싱 & 캐릭터별 색상 칠하기                     */
/*                                                                   */
/*  ✏️  캐릭터 이름 색상을 바꾸려면 parseAllLogs()의 charColors를       */
/*      수정하세요.                                                    */
/* ================================================================= */


/* ─────────────────────────────────────────────────────────────────
   1. 탭 전환 함수들
───────────────────────────────────────────────────────────────── */

/**
 * 상단 네비게이션 탭을 전환합니다.
 * 클릭된 탭에 해당하는 .content-card 섹션을 표시하고
 * 나머지는 숨깁니다.
 *
 * 매개변수:
 *   id  : 표시할 섹션의 id 속성값 (예: 'home', 'Gallery', 'char-가나')
 *   btn : 클릭된 .nav-btn 요소 (active 클래스를 붙이기 위해 필요)
 */
window.openTab = function (id, btn) {
    /* 모든 콘텐츠 카드에서 active 클래스 제거 (숨기기) */
    document.querySelectorAll('.content-card').forEach(function (card) {
        card.classList.remove('active');
    });

    /* 모든 nav-btn에서 active 클래스 제거 */
    document.querySelectorAll('.nav-btn').forEach(function (navBtn) {
        navBtn.classList.remove('active');
    });

    /* 요청한 id의 섹션을 찾아서 active 클래스 추가 (보이게 하기) */
    var target = document.getElementById(id);
    if (target) target.classList.add('active');

    /* 클릭된 버튼에 active 클래스 추가 (강조 표시) */
    if (btn) {
        btn.classList.add('active');
    } else {
        /* btn이 null이면 첫 번째 nav-btn에 active 붙이기 (fallback) */
        var firstBtn = document.querySelector('.nav-btn');
        if (firstBtn) firstBtn.classList.add('active');
    }

    /* ── 탭 전환 후 필요한 초기화 작업들 ── */

    /* 레이더 차트: 탭이 바뀌면 숨겨있던 캔버스가 보이므로 다시 그려야 함 */
    setTimeout(function () {
        if (typeof drawAllRadarCharts === 'function') drawAllRadarCharts();
    }, 50);

    /* 관계도 탭: 맵 데이터를 불러와서 그리기 */
    if (id === 'relations') {
        setTimeout(function () {
            if (typeof loadAndDrawMap === 'function') loadAndDrawMap();
        }, 50);
    }

    /* 상점 탭: 소지금 표시 업데이트 */
    if (id === 'Shop') {
        setTimeout(function () {
            if (typeof updateShopMoneyDisplay === 'function') updateShopMoneyDisplay();
        }, 50);
    }

    /* 갤러리 탭: 게시글 첫 페이지 불러오기 */
    if (id === 'Gallery') {
        if (typeof loadGalleryData === 'function') loadGalleryData(1);
    }

    /* 미니게임 탭: 소지금 업데이트 + 야바위 컵 위치 초기화 */
    if (id === 'MiniGames') {
        if (typeof updateMiniGameMoneyDisplay === 'function') updateMiniGameMoneyDisplay();
        if (typeof initShellPositions         === 'function') initShellPositions();
    }

    /* 캐릭터 탭: BGM 설정 (setupCharacterBGM은 index.html 인라인 스크립트에 있음) */
    if (id.startsWith('char-')) {
        var phase = window.globalMainPhase || 0;
        /* 캐릭터 탭이 열리면 해당 챕터로 자동 이동 */
        setTimeout(function () {
            var section   = document.getElementById(id);
            if (!section) return;
            var phaseBtns = section.querySelectorAll('.phase-tabs > .phase-btn');
            if (phaseBtns.length > phase && typeof window.changePhase === 'function') {
                window.changePhase(phaseBtns[phase], phase);
            }
        }, 50);

        /* 해당 캐릭터의 BGM 설정 */
        if (typeof allProfiles !== 'undefined') {
            var profile = allProfiles.find(function (p) {
                var pid = p.char_id.startsWith('char-') ? p.char_id : 'char-' + p.char_id;
                return pid === id && p.phase === (window.globalMainPhase || 0);
            });
            if (typeof setupCharacterBGM === 'function') {
                setupCharacterBGM(profile ? profile.bgm_url : '');
            }
        }
    } else {
        /* 캐릭터 탭이 아니면 BGM 초기화 */
        if (typeof setupCharacterBGM === 'function') setupCharacterBGM('');
    }
};

/**
 * 챕터(Phase) 탭을 전환합니다.
 * 하나의 content-card 안에서 1부/2부/3부/4부를 전환합니다.
 *
 * 매개변수:
 *   btn : 클릭된 .phase-btn 요소
 *   idx : 보여줄 슬라이드 인덱스 (0=1부, 1=2부, ...)
 */
window.changePhase = function (btn, idx) {
    /* btn이 없으면 실행 취소 (방어 코드) */
    if (!btn) return;

    /* 가장 가까운 부모 .content-card를 찾아서 그 안에서만 조작 */
    var section = btn.closest('.content-card');
    if (!section) return;

    var allPhaseBtns   = section.querySelectorAll('.phase-btn');
    var allPhaseSlides = section.querySelectorAll('.phase-slide');

    /* 해당 인덱스의 버튼/슬라이드가 없으면 종료 */
    if (!allPhaseBtns[idx] || !allPhaseSlides[idx]) {
        console.warn('changePhase: 인덱스 ' + idx + '에 해당하는 탭이 없습니다.');
        return;
    }

    /* 모든 탭 버튼에서 active 제거 후 클릭된 것만 active */
    allPhaseBtns.forEach(function (t) { t.classList.remove('active'); });
    allPhaseBtns[idx].classList.add('active');

    /* 모든 슬라이드 숨기고 해당 슬라이드만 표시 */
    allPhaseSlides.forEach(function (s) { s.classList.remove('active'); });
    allPhaseSlides[idx].classList.add('active');

    /* 전역 편집 챕터 인덱스 업데이트 */
    currentEditingPhase = idx;

    /* 활성화된 슬라이드 안의 레이더 차트 다시 그리기 */
    var activeSlide = allPhaseSlides[idx];
    setTimeout(function () {
        if (typeof drawAllRadarCharts === 'function') drawAllRadarCharts(activeSlide);
    }, 50);

    /* 갤러리 섹션이면 해당 챕터 게시글 로드 */
    if (section.id === 'Gallery' && typeof loadGalleryData === 'function') {
        loadGalleryData(1);
    }
};


/* ─────────────────────────────────────────────────────────────────
   2. 홈 슬라이더
   ─────────────────────────────────────────────────────────────────
   대문(home) 섹션의 이미지 슬라이더를 제어합니다.
   currentHomeIdx : 전역 변수 (Config.js에 선언됨)
───────────────────────────────────────────────────────────────── */

/**
 * 특정 슬라이드로 바로 이동합니다.
 * 챕터 탭 버튼(1부/2부/...)에서 호출됩니다.
 *
 * 매개변수:
 *   n : 이동할 슬라이드 인덱스 (0부터 시작)
 */
window.goToHomeSlide = function (n) {
    currentHomeIdx = n;
    updateHomeSlider();
};

/**
 * 현재 슬라이드에서 n만큼 이동합니다.
 * 이전(<) / 다음(>) 화살표 버튼에서 호출됩니다.
 *
 * 매개변수:
 *   n : 이동 방향 (-1=이전, +1=다음)
 */
window.moveHomeSlide = function (n) {
    currentHomeIdx += n;
    updateHomeSlider();
};

/**
 * 슬라이더 트랙을 현재 인덱스 위치로 이동시키고
 * 챕터 탭 버튼의 active 상태를 업데이트합니다.
 * (내부 함수 — 외부에서 직접 호출하지 않아도 됩니다)
 */
function updateHomeSlider() {
    var track  = document.getElementById('home-track');
    var slides = document.querySelectorAll('.home-slide');
    var tabs   = document.querySelectorAll('#home-tabs .phase-btn');

    if (!track || slides.length === 0) return;

    /* 인덱스가 범위를 벗어나면 순환 처리 */
    if (currentHomeIdx >= slides.length) currentHomeIdx = 0;
    if (currentHomeIdx < 0)             currentHomeIdx = slides.length - 1;

    /* CSS translateX로 슬라이드 이동 (부드러운 애니메이션은 style.css의 transition으로) */
    track.style.transform = 'translateX(-' + (currentHomeIdx * 100) + '%)';

    /* 현재 슬라이드에 해당하는 탭 버튼만 active */
    tabs.forEach(function (tab, i) {
        tab.classList.toggle('active', i === currentHomeIdx);
    });
}


/* ─────────────────────────────────────────────────────────────────
   3. 모달 열기 / 닫기
   ─────────────────────────────────────────────────────────────────
   모달은 .auth-overlay 클래스를 가진 div입니다.
   .show 클래스가 붙으면 display:flex 로 표시됩니다.
───────────────────────────────────────────────────────────────── */

/**
 * 로그인 모달을 엽니다.
 * (#auth-modal 의 show 클래스를 추가)
 */
window.openAuthModal = function () {
    var m = document.getElementById('auth-modal');
    if (m) {
        m.style.removeProperty('display'); /* 인라인 display 속성 제거 */
        m.classList.add('show');           /* CSS의 .show 클래스로 표시 */
    }
};

/**
 * 지정한 id의 모달을 닫습니다.
 * 모든 닫기(×) 버튼과 취소 버튼에서 사용합니다.
 *
 * 매개변수:
 *   id : 닫을 모달의 id 속성값 (예: 'edit-modal', 'inv-modal')
 */
window.closeModal = function (id) {
    var m = document.getElementById(id);
    if (m) {
        m.style.removeProperty('display');
        m.classList.remove('show'); /* .show 클래스 제거 → 숨김 */
    }
};


/* ─────────────────────────────────────────────────────────────────
   4. 이미지 라이트박스
   ─────────────────────────────────────────────────────────────────
   이미지를 클릭하면 화면 전체를 덮는 라이트박스로 크게 보여줍니다.
───────────────────────────────────────────────────────────────── */

/**
 * 라이트박스를 열어 이미지를 크게 표시합니다.
 * img 태그의 onclick="openLightbox(this.src)" 에서 호출됩니다.
 *
 * 매개변수:
 *   imgSrc : 표시할 이미지의 URL
 */
window.openLightbox = function (imgSrc) {
    document.getElementById('lightbox-img').src = imgSrc;
    document.getElementById('image-lightbox').classList.add('show');
};

/**
 * 라이트박스를 닫습니다.
 * 라이트박스 배경(오버레이) 클릭 시 호출됩니다.
 */
window.closeLightbox = function () {
    document.getElementById('image-lightbox').classList.remove('show');
};


/* ─────────────────────────────────────────────────────────────────
   5. 라이트 / 다크 테마 토글
   ─────────────────────────────────────────────────────────────────
   body에 'light-mode' 클래스를 추가/제거하여 테마를 전환합니다.
   style.css에서 body.light-mode 셀렉터로 라이트 모드 색상을 정의합니다.
   선택한 테마는 localStorage에 저장되어 다음 방문 시에도 유지됩니다.
───────────────────────────────────────────────────────────────── */

/**
 * 라이트/다크 테마를 전환합니다.
 * 우측 하단 토글 버튼(#theme-toggle)에서 호출됩니다.
 */
window.toggleTheme = function () {
    var body   = document.body;
    var icon   = document.getElementById('theme-icon');
    /* classList.toggle: 클래스가 없으면 추가(true 반환), 있으면 제거(false 반환) */
    var isLight = body.classList.toggle('light-mode');

    try {
        if (isLight) {
            /* 라이트 모드로 전환 */
            localStorage.setItem('theme', 'light');
            /* ✏️  라이트 모드 아이콘 URL을 교체하세요 */
            if (icon) icon.src = 'https://placehold.co/24x24/333/fff?text=☀';
        } else {
            /* 다크 모드로 전환 */
            localStorage.setItem('theme', 'dark');
            /* ✏️  다크 모드 아이콘 URL을 교체하세요 */
            if (icon) icon.src = 'https://placehold.co/24x24/888/fff?text=☀';
        }
    } catch (e) {
        /* localStorage를 사용할 수 없는 환경(예: 시크릿 모드 일부)에서 에러 무시 */
        console.warn('localStorage 사용 불가:', e);
    }
};

/**
 * 저장된 테마 설정을 불러와 적용합니다.
 * 페이지 로드 시 자동으로 호출됩니다.
 */
function loadTheme() {
    try {
        var savedTheme = localStorage.getItem('theme');
        var icon       = document.getElementById('theme-icon');
        var isLight    = (savedTheme === 'light');

        /* 저장된 테마 적용 */
        document.body.classList.toggle('light-mode', isLight);

        /* 테마에 맞는 아이콘 표시 */
        if (icon) {
            icon.src = isLight
                ? 'https://placehold.co/24x24/333/fff?text=☀'
                : 'https://placehold.co/24x24/888/fff?text=☀';
        }
    } catch (e) {
        console.warn('테마 불러오기 실패:', e);
    }
}


/* ─────────────────────────────────────────────────────────────────
   6. 배경 먼지 파티클 효과
   ─────────────────────────────────────────────────────────────────
   화면 전체에 작은 점들이 천천히 떠오르는 효과를 만듭니다.
   #dust-container div(index.html에 있음)에 파티클을 추가합니다.
   비활성화하려면 이 함수를 호출하지 않거나 내용을 비우면 됩니다.
───────────────────────────────────────────────────────────────── */

/**
 * 배경 파티클을 생성합니다.
 * 페이지 로드 시 window.load 이벤트에서 호출됩니다.
 */
function createDust() {
    var container = document.getElementById('dust-container');
    if (!container) return;

    /* ✏️  파티클 개수를 조절하고 싶으면 아래 숫자(30)를 바꾸세요 */
    for (var i = 0; i < 30; i++) {
        var particle = document.createElement('div');
        particle.className = 'dust-particle';

        /* 각 파티클의 크기, 위치, 속도를 무작위로 설정 */
        particle.style.cssText = [
            'width:'  + (Math.random() * 2 + 0.5) + 'px',  /* 0.5~2.5px 크기 */
            'height:' + (Math.random() * 2 + 0.5) + 'px',
            'left:'   + (Math.random() * 100) + 'vw',       /* 화면 가로 어디든 */
            'top:'    + (Math.random() * 100 + 50) + 'vh',  /* 화면 아래쪽에서 시작 */
            'animation-duration:' + (Math.random() * 14 + 10) + 's', /* 10~24초 */
        ].join(';');

        container.appendChild(particle);
    }
}


/* ─────────────────────────────────────────────────────────────────
   7. NPC 관계 배지 색상 자동 칠하기
   ─────────────────────────────────────────────────────────────────
   index.html의 NPC 카드에 data-relation 속성이 있으면
   자동으로 색상 배지를 추가합니다.
   예) <div class="relation-card" data-relation="적">
───────────────────────────────────────────────────────────────── */

/**
 * .relation-card 요소를 찾아서 data-relation 속성값에 따라
 * 색상 배지를 자동으로 추가합니다.
 * 
 * ✏️  관계 종류와 색상을 추가/수정하려면 colorMap을 편집하세요.
 */
function buildRelationBadges() {
    /*
     * 관계 종류 → 배지 색상 매핑 테이블
     * bg: 배경색, text: 글자색
     *
     * ✏️  여기에 새로운 관계 종류를 추가할 수 있습니다.
     *     예) '동료': { bg: '#1a2a3a', text: '#aad4ff' }
     */
    var colorMap = {
        '적':    { bg: '#3a1a1a', text: '#ff9999' }, /* 빨간 계열 */
        '아군':  { bg: '#1a2a1a', text: '#99cc99' }, /* 초록 계열 */
        '중립':  { bg: '#2a2a2a', text: '#cccccc' }, /* 회색 계열 */
        '의뢰인':{ bg: '#1a1a2a', text: '#9999ff' }, /* 파란 계열 */
        '동료':  { bg: '#2a2a1a', text: '#cccc99' }, /* 노란 계열 */
    };

    /* data-relation 속성이 있는 모든 카드를 순회 */
    document.querySelectorAll('.relation-card[data-relation]').forEach(function (card) {
        /* 이미 배지가 있으면 중복 추가 방지 */
        if (card.querySelector('.relation-badge')) return;

        var relationType = card.dataset.relation; /* data-relation 속성값 */
        var style        = colorMap[relationType];

        if (!style) return; /* 정의되지 않은 관계 종류면 건너뜀 */

        /* 배지 span 요소 생성 */
        var badge          = document.createElement('span');
        badge.className    = 'relation-badge';
        badge.textContent  = relationType;
        badge.style.cssText =
            'background:' + style.bg   + ';' +
            'color:'      + style.text + ';' +
            'border: 1px solid ' + style.text + '33;'; /* 글자색의 20% 투명도로 테두리 */

        card.style.position = 'relative'; /* 배지의 absolute 위치 기준점 */
        card.prepend(badge);              /* 카드 맨 앞에 배지 삽입 */
    });
}


/* ─────────────────────────────────────────────────────────────────
   8. 세션 로그 텍스트 파싱 & 캐릭터별 색상
   ─────────────────────────────────────────────────────────────────
   Records(기록) 탭의 details > .details-content 안에
   [main] 캐릭터이름 : 대사 형식으로 입력하면
   캐릭터별로 다른 색상으로 자동 변환됩니다.
───────────────────────────────────────────────────────────────── */

/**
 * Records 탭의 로그 텍스트를 파싱하여 HTML로 변환합니다.
 * 
 * 입력 형식:
 *   [main] 가나다 : 여기에 대사를 입력합니다.
 *   [main] GM : 상황 설명을 입력합니다.
 * 
 * ✏️  charColors에 본인 캐릭터 이름과 색상을 추가하세요.
 *     색상은 CSS 색상 문자열이면 무엇이든 됩니다.
 *     예) 'rgba(200,200,200,0.9)' 또는 '#cccccc'
 */
function parseAllLogs() {
    /*
     * 캐릭터 이름 → 색상 매핑 테이블
     *
     * ✏️  왼쪽의 이름을 실제 캐릭터 이름으로 바꾸고
     *     오른쪽의 색상을 원하는 색으로 설정하세요.
     *     기본 테마가 흑백이므로 회색 계열 색상을 권장합니다.
     */
    var charColors = {
        '가나다':  '#cccccc', /* 캐릭터 1 — 흰색 계열 */
        '다라마':  '#aaaaaa', /* 캐릭터 2 — 연회색 */
        '마바사':  '#888888', /* 캐릭터 3 — 중간 회색 */
        '사아자':  '#666666', /* 캐릭터 4 — 짙은 회색 */
        'GM':      '#ffffff', /* GM / 진행자 — 흰색 */
        'SYSTEM':  '#444444', /* 시스템 메시지 — 어두운 회색 */
    };

    /* .details-content 클래스를 가진 모든 요소를 순회 */
    document.querySelectorAll('.details-content').forEach(function (container) {
        /* 이미 파싱된 내용이면 다시 파싱하지 않음 (중복 방지) */
        if (container.innerHTML.includes('class="log-item"')) return;

        /* &nbsp; 등의 HTML 엔티티를 일반 공백으로 변환 */
        var rawText = container.innerHTML.replace(/&nbsp;/g, ' ').trim();

        /*
         * 정규식으로 [main] 형식의 로그 줄을 찾아 추출합니다.
         * 패턴: [main] 이름 : 대사 (다음 [main] 이전까지)
         */
        var pattern = /\[main\]\s*(.*?)\s*:\s*(.*?)(?=\s*\[main\]|$)/g;
        var html    = '';
        var match;

        while ((match = pattern.exec(rawText)) !== null) {
            var charName = match[1].trim();  /* 캐릭터 이름 */
            var message  = match[2].trim();  /* 대사 내용 */

            /* charColors에 정의된 색상 사용, 없으면 기본 회색 */
            var color = charColors[charName] || '#666666';

            /* 로그 항목 HTML 생성 */
            html +=
                '<div class="log-item" style="margin-bottom:8px; line-height:1.6;">' +
                    '<b class="log-name" style="color:' + color + '; margin-right:8px;">' + charName + '</b>' +
                    '<span style="color:#888;">' + message + '</span>' +
                '</div>';
        }

        /* 파싱된 HTML이 있으면 교체, 없으면 원본 유지 */
        if (html) container.innerHTML = html;
    });
}
