/* ================================================================= */
/* UI.js — 사용자 인터페이스 헬퍼 함수 모음 (통합 및 최적화 버전)     */
/* */
/* 이 파일이 담당하는 일:                                             */
/* 1. 네비게이션 및 챕터 탭 전환 (openTab, changePhase 안전 버전)     */
/* 2. 홈 이미지 슬라이더 제어                                         */
/* 3. 시스템 모달 및 이미지 라이트박스 제어                            */
/* 4. 라이트/다크 테마 토글 및 data-theme 속성 연동                    */
/* 5. 배경 파티클 효과 생성                                           */
/* 6. NPC 관계 배지 색상 자동 렌더링 (모노톤 스타일)                  */
/* 7. 세션 로그 텍스트 파싱 & 캐릭터별 색상 매핑                      */
/* ================================================================= */

/* ─────────────────────────────────────────────────────────────────
   1. 탭 전환 함수 인터페이스 (Navigation & Phase)
───────────────────────────────────────────────────────────────── */

/**
 * 상단 네비게이션 탭을 전환합니다.
 * 해당하는 .content-card 섹션을 활성화하고 나머지는 비활성화합니다.
 * * 매개변수:
 * id  : 표시할 섹션의 id 속성값 (예: 'home', 'Gallery', 'char-p1')
 * btn : 클릭된 .nav-btn 요소
 */
window.openTab = function (id, btn) {
    /* 모든 콘텐츠 카드와 버튼에서 활성화 클래스 제거 */
    document.querySelectorAll('.content-card').forEach(card => card.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(navBtn => navBtn.classList.remove('active'));

    /* 대상 섹션 및 버튼 활성화 */
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
    
    if (btn) {
        btn.classList.add('active');
    } else {
        const firstBtn = document.querySelector('.nav-btn');
        if (firstBtn) firstBtn.classList.add('active');
    }

    /* ── 탭 전환 후 컴포넌트별 리렌더링 및 동기화 지연 처리 ── */

    /* 레이더 차트 다시 그리기 */
    setTimeout(() => {
        if (typeof drawAllRadarCharts === 'function') drawAllRadarCharts();
    }, 50);

    /* 관계도 탭 데이터 로드 및 렌더링 */
    if (id === 'relations') {
        setTimeout(() => {
            if (typeof loadAndDrawMap === 'function') loadAndDrawMap();
        }, 50);
    }

    /* 상점 탭 소지금 표시 동기화 */
    if (id === 'Shop') {
        setTimeout(() => {
            if (typeof updateShopMoneyDisplay === 'function') updateShopMoneyDisplay();
        }, 50);
    }

    /* 갤러리 탭 첫 페이지 로드 */
    if (id === 'Gallery') {
        if (typeof loadGalleryData === 'function') loadGalleryData(1);
    }

    /* 미니게임 탭 데이터 및 요소 초기화 */
    if (id === 'MiniGames') {
        if (typeof updateMiniGameMoneyDisplay === 'function') updateMiniGameMoneyDisplay();
        if (typeof initShellPositions         === 'function') initShellPositions();
    }

    /* 대련장 탭전 드롭다운 및 대기실 초기화 */
    if (id === 'Sparring' && typeof CombatSys !== 'undefined') {
        if (typeof CombatSys.initDropdowns === 'function') CombatSys.initDropdowns();
    }

    /* 캐릭터 개별 탭 진입 시 페이즈 강제 동기화 및 BGM 재생 제어 */
    if (id.startsWith('char-')) {
        const phase = window.globalMainPhase || 0;
        
        setTimeout(() => {
            const section = document.getElementById(id);
            if (!section) return;
            const phaseBtns = section.querySelectorAll('.phase-tabs > .phase-btn');
            if (phaseBtns.length > phase && typeof window.changePhase === 'function') {
                window.changePhase(phaseBtns[phase], phase);
            }
        }, 50);

        /* 전역 프로필 데이터셋에서 해당 페이즈의 BGM URL을 매칭하여 재생 */
        if (typeof allProfiles !== 'undefined') {
            const profile = allProfiles.find(p => {
                const pid = p.char_id.startsWith('char-') ? p.char_id : 'char-' + p.char_id;
                return pid === id && p.phase === (window.globalMainPhase || 0);
            });
            if (typeof setupCharacterBGM === 'function') {
                setupCharacterBGM(profile ? profile.bgm_url : '');
            }
        }
    } else {
        /* 캐릭터 외 일반 메뉴 탭 영역일 경우 개별 BGM 오디오 정리 */
        if (typeof setupCharacterBGM === 'function') setupCharacterBGM('');
    }
};

/**
 * 콘텐츠 카드 내부의 챕터(Phase) 서브 탭을 전환합니다.
 * * 매개변수:
 * btn : 클릭된 .phase-btn 요소
 * idx : 보여줄 슬라이드 인덱스 (0=Chapter 1, 1=Chapter 2, ...)
 */
window.changePhase = function (btn, idx) {
    if (!btn) return;

    const section = btn.closest('.content-card');
    if (!section) return;

    const btns = section.querySelectorAll('.phase-btn');
    const slides = section.querySelectorAll('.phase-slide');

    /* ★ 에러 방지 안전장치: 인덱스가 범위를 벗어나거나 요소가 없으면 조기 종료 */
    if (!btns[idx] || !slides[idx]) {
        console.warn(`changePhase: 인덱스 ${idx} 에 해당하는 페이즈 팩터가 누락되었습니다.`);
        return;
    }

    /* 서브 탭 버튼 및 슬라이드 활성화 상태 변경 */
    btns.forEach(t => t.classList.remove('active'));
    slides.forEach(s => s.classList.remove('active'));
    
    btns[idx].classList.add('active');
    slides[idx].classList.add('active');

    /* 전역 편집 대상 페이즈 포인터 갱신 */
    currentEditingPhase = idx;

    /* 변경된 페이즈 내부의 능력치 차트 레이아웃 재연산 */
    const activeSlide = slides[idx];
    setTimeout(() => {
        if (typeof drawAllRadarCharts === 'function') drawAllRadarCharts(activeSlide);
    }, 50);

    /* 갤러리 카드 챕터 갱신 시 피드 데이터 리로드 */
    if (section.id === 'Gallery' && typeof loadGalleryData === 'function') {
        loadGalleryData(1);
    }
};

/* ─────────────────────────────────────────────────────────────────
   2. 홈 화면 타임라인 슬라이더 인터페이스
───────────────────────────────────────────────────────────────── */

window.goToHomeSlide = (n) => {
    currentHomeIdx = n;
    updateHomeSlider();
};

window.moveHomeSlide = (n) => {
    currentHomeIdx += n;
    updateHomeSlider();
};

function updateHomeSlider() {
    const track = document.getElementById('home-track');
    const slides = document.querySelectorAll('.home-slide');
    const tabs = document.querySelectorAll('#home-tabs .phase-btn');

    if (!track || slides.length === 0) return;

    if (currentHomeIdx >= slides.length) currentHomeIdx = 0;
    if (currentHomeIdx < 0)              currentHomeIdx = slides.length - 1;

    track.style.transform = `translateX(-${currentHomeIdx * 100}%)`;

    tabs.forEach((tab, i) => {
        tab.classList.toggle('active', i === currentHomeIdx);
    });
}

/* ─────────────────────────────────────────────────────────────────
   3. 시스템 공통 모달 제어 함수
───────────────────────────────────────────────────────────────── */

window.openAuthModal = () => {
    const m = document.getElementById('auth-modal');
    if (m) {
        m.style.removeProperty('display');
        m.classList.add('show');
    }
};

window.closeModal = (id) => {
    const m = document.getElementById(id);
    if (m) {
        m.style.removeProperty('display');
        m.classList.remove('show');
    }
};

/* ─────────────────────────────────────────────────────────────────
   4. 이미지 라이트박스 (크게 보기)
───────────────────────────────────────────────────────────────── */

window.openLightbox = (imgSrc) => {
    document.getElementById('lightbox-img').src = imgSrc;
    document.getElementById('image-lightbox').classList.add('show');
};

window.closeLightbox = () => {
    document.getElementById('image-lightbox').classList.remove('show');
};

/* ─────────────────────────────────────────────────────────────────
   5. 테마 설정 및 스타일 쿼리 바인딩
───────────────────────────────────────────────────────────────── */

window.toggleTheme = function () {
    const body = document.body;
    const icon = document.getElementById('theme-icon');
    const isLight = body.classList.toggle('light-mode');
    
    /* 흑백 스타일 제어용 속성 바인딩 */
    body.setAttribute('data-theme', isLight ? 'light' : 'dark');

    try {
        if (isLight) {
            localStorage.setItem('theme', 'light');
            if (icon) icon.src = 'https://placehold.co/24x24/333333/ffffff?text=L';
        } else {
            localStorage.setItem('theme', 'dark');
            if (icon) icon.src = 'https://placehold.co/24x24/888888/ffffff?text=D';
        }
    } catch (e) {
        console.warn('localStorage 접근이 거부되었습니다.', e);
    }
};

function loadTheme() {
    try {
        const savedTheme = localStorage.getItem('theme');
        const icon = document.getElementById('theme-icon');
        const body = document.body;
        const isLight = (savedTheme === 'light');

        body.classList.toggle('light-mode', isLight);
        body.setAttribute('data-theme', isLight ? 'light' : 'dark');

        if (icon) {
            icon.src = isLight
                ? 'https://placehold.co/24x24/333333/ffffff?text=L'
                : 'https://placehold.co/24x24/888888/ffffff?text=D';
        }
    } catch (e) {
        console.warn('테마 설정을 복원할 수 없습니다.', e);
    }
}

/* ─────────────────────────────────────────────────────────────────
   6. 가상 파티클 환경 생성
───────────────────────────────────────────────────────────────── */

function createDust() {
    const container = document.getElementById('dust-container');
    if (!container) return;

    for (let i = 0; i < 40; i++) {
        const particle = document.createElement('div');
        particle.className = 'dust-particle';

        particle.style.cssText = `
            width: ${Math.random() * 2 + 0.5}px;
            height: ${Math.random() * 2 + 0.5}px;
            left: ${Math.random() * 100}vw;
            top: ${Math.random() * 100 + 50}vh;
            animation-duration: ${Math.random() * 14 + 10}s;
        `;

        container.appendChild(particle);
    }
}

/* ─────────────────────────────────────────────────────────────────
   7. 관계 배지 자동 스타일 렌더링 (모노톤 테마)
───────────────────────────────────────────────────────────────── */

function buildRelationBadges() {
    /* 흑백 모노톤 기반 정렬 스타일 매핑 스펙트럼 */
    const colorMap = {
        '적':     { bg: '#222222', text: '#ffffff' },
        '아군':   { bg: '#ffffff', text: '#000000' },
        '중립':   { bg: '#333333', text: '#cccccc' },
        '의뢰인': { bg: '#1a1a1a', text: '#aaaaaa' },
        '동료':   { bg: '#444444', text: '#eeeeee' }
    };

    document.querySelectorAll('.relation-card[data-relation]').forEach(card => {
        if (card.querySelector('.relation-badge')) return;

        const relationType = card.dataset.relation;
        const style = colorMap[relationType];

        if (!style) return;

        const badge = document.createElement('span');
        badge.className = 'relation-badge';
        badge.textContent = relationType;
        
        badge.style.cssText = `
            position: absolute; 
            top: 10px; 
            right: 10px;
            background: ${style.bg}; 
            color: ${style.text};
            padding: 2px 8px; 
            border-radius: 4px;
            font-size: 0.7rem; 
            font-weight: bold;
            border: 1px solid rgba(255, 255, 255, 0.1);
        `;

        card.style.position = 'relative';
        card.prepend(badge);
    });
}

/* ─────────────────────────────────────────────────────────────────
   8. 세션 로그 데이터 가공 및 모노톤 가독성 처리
───────────────────────────────────────────────────────────────── */

function parseAllLogs() {
    /* 무관한 범용 더미 데이터 이름 레이블 유지 (그레이스케일 매핑) */
    const charColors = {
        '가나다':  '#ffffff', 
        '다라마':  '#dddddd', 
        '마바사':  '#bbbbbb', 
        '사아자':  '#999999', 
        'GM':      '#eeeeee', 
        'SYSTEM':  '#555555'  
    };

    document.querySelectorAll('.details-content').forEach(container => {
        if (container.innerHTML.includes('class="log-item"')) return;

        const rawText = container.innerHTML.replace(/&nbsp;/g, ' ').trim();
        const pattern = /\[main\]\s*(.*?)\s*:\s*(.*?)(?=\s*\[main\]|$)/g;
        let html = '';
        let match;

        while ((match = pattern.exec(rawText)) !== null) {
            const charName = match[1].trim();
            const message = match[2].trim();
            const color = charColors[charName] || '#aaaaaa';

            html += `
                <div class="log-item" style="margin-bottom:8px; line-height:1.6;">
                    <b class="log-name" style="color:${color}; margin-right:8px;">${charName}</b>
                    <span class="msg-text" style="color:#cccccc;">${message}</span>
                </div>`;
        }

        if (html) container.innerHTML = html;
    });
}
