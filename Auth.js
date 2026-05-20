/* ================================================================= */
/*  Auth.js — 인증 & DB 공통 유틸 (4인 파티 기준)                    */
/*  1. 로그인 / 회원가입 / 로그아웃                                  */
/*  2. 로그인 상태 확인 & 편집 버튼 주입 (권한별 UI 활성화)          */
/*  3. upsert 헬퍼 (DB 저장/업데이트 공통 함수)                      */
/*  4. 전체 캐릭터 데이터 로드 (더미 데이터 및 실 DB 연동)           */
/*  5. imgbb 이미지 업로드                                           */
/*  6. 색상 변환 유틸                                                */
/* ================================================================= */

/* ─────────────────────────────────────────────────────────────────
   1. 로그인 / 회원가입 / 로그아웃
   Supabase Auth API를 사용하여 플레이어들의 인증을 처리합니다.
───────────────────────────────────────────────────────────────── */

/**
 * 로그인 처리 함수
 * 사용자가 입력한 이메일과 더미/실제 비밀번호를 바탕으로 세션을 생성합니다.
 */
window.handleLogin = async function () {
    const e = document.getElementById('auth-email').value;
    const p = document.getElementById('auth-password').value;
    
    const { error } = await supabaseClient.auth.signInWithPassword({ email: e, password: p });
    
    if (error) {
        alert('로그인 실패: ' + error.message);
    } else {
        // 성공 시 페이지를 새로고침하여 checkLoginState()가 실행되도록 합니다.
        location.reload();
    }
};

/**
 * 회원가입 처리 함수
 * 새로운 4인 파티원(또는 관전자)을 등록할 때 사용합니다.
 */
window.handleSignUp = async function () {
    const e = document.getElementById('auth-email').value;
    const p = document.getElementById('auth-password').value;
    
    const { error } = await supabaseClient.auth.signUp({ email: e, password: p });
    
    if (error) {
        alert('가입 실패: ' + error.message);
    } else {
        alert('가입 완료! 승인 후 로그인 해주세요.');
        closeModal('auth-modal');
    }
};

/**
 * 로그아웃 처리 함수
 * 현재 세션을 파기하고 UI를 초기 상태로 되돌립니다.
 */
window.signOut = async function () {
    await supabaseClient.auth.signOut();
    location.reload();
};

/**
 * 로그인 모달창 열기
 * 인증되지 않은 사용자가 기능을 이용하려 할 때 호출됩니다.
 */
window.openAuthModal = function () {
    var m = document.getElementById('auth-modal');
    if (m) m.classList.add('show');
};


/* ─────────────────────────────────────────────────────────────────
   2. 로그인 상태 확인 & 편집 버튼 주입
   현재 접속한 사용자가 누구인지 확인하고, 
   본인 소유의 캐릭터(A, B, C, D 중 하나)에만 편집 권한(버튼)을 부여합니다.
───────────────────────────────────────────────────────────────── */
async function checkLoginState() {
    if (!supabaseClient) return;

    var user = null;
    try {
        // 현재 로컬 세션에 저장된 사용자 정보를 가져옵니다.
        var res = await supabaseClient.auth.getUser();
        user = (res.data && res.data.user) ? res.data.user : null;
    } catch (e) { 
        console.warn('사용자 정보를 가져오는 중 오류 발생:', e); 
        return; 
    }
    
    // 전역 변수에 현재 유저 정보 할당
    currentUser = user;

    var loginBtn  = document.getElementById('login-btn');
    var logoutBtn = document.getElementById('logout-btn');
    
    // 비로그인 상태일 경우 편집 버튼들을 주입하지 않고 종료합니다.
    if (!user) return;
    
    // 로그인/로그아웃 버튼 UI 토글
    if (loginBtn)  loginBtn.style.display  = 'none';
    if (logoutBtn) logoutBtn.style.display = 'inline-block';

    /* [관리자 권한 처리] 
       Config.js에 정의된 adminEmails (더미 데이터 예: admin@test.com) 배열에 포함될 경우, 
       모든 캐릭터의 소지금 행을 클릭해 자금 관리 모달을 열 수 있습니다. */
    if (adminEmails.includes(user.email)) {
        document.querySelectorAll('.money-row').forEach(function (row) {
            row.classList.add('editable-area');
            row.onclick = function () {
                var charId = row.closest('.content-card') ? row.closest('.content-card').id : null;
                var slide  = row.closest('.phase-slide');
                // 현재 속한 파트(타임라인) 인덱스 계산
                var phaseIndex = slide ? Array.from(slide.parentNode.children).indexOf(slide) : 0;
                
                if (typeof window.openMoneyModal === 'function') {
                    window.openMoneyModal(charId, phaseIndex); 
                } else {
                    console.error("오류: 자금 관리 모달 함수가 아직 로드되지 않았습니다.");
                }
            };
        });
    }

    /* [본인 캐릭터 편집 권한 처리]
       charOwners (더미 매핑 예: player1@test.com -> char-ho1) 객체를 참조하여
       현재 사용자의 캐릭터 ID를 찾습니다. */
    var myCharId = charOwners[user.email];
    if (!myCharId) return; // 권한이 할당된 캐릭터가 없으면 종료
    
    var section = document.getElementById(myCharId);
    if (!section) return;
    
    // Config.js의 charData(4인 더미 기본 데이터)에서 베이스 정보를 가져옵니다.
    var base = charData.find(function (c) { return c.id === myCharId.replace('char-', ''); });

    /* (1) 한마디(Quote) 편집 버튼 주입 */
    section.querySelectorAll('.char-quote').forEach(function (q, i) {
        if (q.querySelector('.edit-icon-btn')) return; // 중복 생성 방지
        var btn = document.createElement('button');
        btn.className = 'edit-icon-btn';
        btn.innerHTML = '&#9998;';
        // 클릭 시 프로필 편집 모달 오픈
        btn.onclick   = function () { openGeneralModal(myCharId, i); };
        if (base) btn.style.backgroundColor = 'rgb(' + base.color + ')';
        q.appendChild(btn);
    });

    /* (2) 레이더 차트 클릭 이벤트 (능력치 편집) */
    section.querySelectorAll('.radar-chart').forEach(function (c, i) {
        c.classList.add('editable-area');
        c.onclick = function () { openStatsModal(myCharId, i); };
    });

    /* (3) 무기/전투 스탯 영역 클릭 이벤트 */
    section.querySelectorAll('.weapon-display-wrapper').forEach(function (w, i) {
        w.classList.add('editable-area');
        w.onclick = function () { openWeaponModal(myCharId, i); };
    });

    /* (4) 인벤토리(소지품) 영역 클릭 이벤트 및 우편함 버튼 추가 */
    section.querySelectorAll('.rpg-inventory').forEach(function (inv, i) {
        inv.classList.add('editable-area');
        inv.onclick = function () { openInvModal(myCharId, i); };

        var headerWrap = inv.previousElementSibling;
        // 인벤토리 상단에 '우편함 열기' 버튼을 동적으로 주입합니다.
        if (headerWrap &&
            headerWrap.classList.contains('inv-header-wrapper') &&
            !headerWrap.querySelector('.open-mailbox-btn')) {
            var mBtn = document.createElement('button');
            mBtn.className = 'open-mailbox-btn';
            mBtn.innerHTML = '우편함 열기';
            mBtn.onclick = function (e) { 
                e.stopPropagation(); // 인벤토리 열기 이벤트(부모)가 트리거되지 않도록 차단
                openMailboxModal(myCharId, i); 
            };
            headerWrap.appendChild(mBtn);
        }
    });
}


/* ─────────────────────────────────────────────────────────────────
   3. upsert 헬퍼 (데이터 삽입 및 업데이트 공통화)
   캐릭터의 프로필, 스탯 등을 Supabase에 저장할 때 사용하는 유틸리티입니다.
───────────────────────────────────────────────────────────────── */
async function upsertProfileData(updates) {
    // 전역 변수인 currentEditingId와 currentEditingPhase를 사용하여 대상을 식별합니다.
    if (!supabaseClient || !currentEditingId) return { error: 'DB 클라이언트가 없거나 편집 중인 ID가 지정되지 않았습니다.' };
    
    try {
        // 기존 데이터가 존재하는지 확인 (Select)
        var sel = await supabaseClient
            .from('character_profiles')
            .select('char_id')
            .eq('char_id', currentEditingId)
            .eq('phase', currentEditingPhase);

        // 데이터가 있다면 Update, 없다면 Insert
        if (sel.data && sel.data.length > 0) {
            return await supabaseClient
                .from('character_profiles')
                .update(updates)
                .eq('char_id', currentEditingId)
                .eq('phase', currentEditingPhase);
        } else {
            var row = Object.assign({}, updates, { char_id: currentEditingId, phase: currentEditingPhase });
            return await supabaseClient.from('character_profiles').insert([row]);
        }
    } catch (e) {
        console.error('upsertProfileData 처리 중 치명적 오류:', e);
        return { error: e };
    }
}


/* ─────────────────────────────────────────────────────────────────
   4. 전체 캐릭터 데이터 로드
   앱 초기화 시 호출되며, 4인 파티의 모든 DB 데이터를 불러와 DOM에 반영합니다.
───────────────────────────────────────────────────────────────── */
async function loadCharacterData() {
    if (!supabaseClient) return;

    var fetched;
    try {
        // 전체 캐릭터 프로필 데이터를 한 번에 가져옵니다.
        fetched = await supabaseClient.from('character_profiles').select('*');
    } catch (e) { 
        console.error('loadCharacterData 네트워크/패치 오류:', e); 
        return; 
    }
    
    if (fetched.error) { 
        console.error('loadCharacterData DB 쿼리 오류:', fetched.error); 
        return; 
    }

    allProfiles = fetched.data || [];

    // 불러온 데이터를 각 캐릭터 DOM 요소(char-ho1 ~ char-ho4)에 매핑하여 뿌려줍니다.
    allProfiles.forEach(function (profile) {
        var section = document.getElementById(profile.char_id);
        if (!section) return; // 4인 중 없는 ID면 스킵

        var phaseIdx    = profile.phase || 0;
        var targetSlide = section.querySelectorAll('.phase-slide')[phaseIdx];
        if (!targetSlide) return;

        /* (1) 프로필 이미지 업데이트 */
        var profImg = targetSlide.querySelector('.main-profile-img');
        if (profImg && profile.profile_image) profImg.src = profile.profile_image;

        /* (2) 캐릭터 한마디(Quote) 업데이트 */
        var quoteTxt = targetSlide.querySelector('.quote-text');
        if (quoteTxt && profile.quote) quoteTxt.innerText = profile.quote;

        /* (3) 기본 인적사항(직업, 나이, 거주지) 업데이트 */
        var infoValues = targetSlide.querySelectorAll('.info-value');
        if (infoValues.length >= 4) {
            // 인덱스 1: 직업, 2: 나이, 3: 거주지 (0은 보통 이름 등)
            infoValues[1].innerText = profile.job       || '?';
            infoValues[2].innerText = profile.age       || '?';
            infoValues[3].innerText = profile.residence || '?';
        }

        /* (4) 백스토리(소개) 업데이트 */
        var intro = targetSlide.querySelector('.section-intro');
        if (intro && profile.backstory) intro.innerText = profile.backstory;

        /* (5) 스탯 및 테마 컬러 속성 주입 (이후 Radar.js가 차트를 그릴 때 사용) */
        var sw = targetSlide.querySelector('.stats-wrapper');
        if (sw) {
            if (profile.stats)       sw.setAttribute('data-stats', profile.stats);
            if (profile.chart_color) sw.setAttribute('data-color', profile.chart_color);
        }

        /* (6) 소지금 (G) 업데이트 */
        var moneyDisplay = targetSlide.querySelector('.money-display');
        if (moneyDisplay) {
            moneyDisplay.innerText = (profile.money ? parseInt(profile.money) : 0).toLocaleString() + ' G';
        }

        /* (7) 무기 데이터 파싱 및 UI 렌더링 */
        var wpnWrapper = targetSlide.querySelector('.weapon-display-wrapper');
        if (wpnWrapper) {
            var wData = profile.weapon_data || '{}';
            wpnWrapper.setAttribute('data-weapon', wData);

            // 전투 파싱 기본 더미값 세팅
            var parsed = { brawl: 25, weapons: [] }; 
            try {
                if (wData.startsWith('{')) {
                    // JSON 형태인 경우
                    var tmp        = JSON.parse(wData);
                    parsed.brawl   = tmp.brawl   || 25;
                    parsed.weapons = tmp.weapons || [];
                } else {
                    // 레거시 파이프(|) 구분 형태 호환성 유지
                    var parts  = wData.split('|');
                    parsed.brawl = parseInt(parts[1]) || 25;
                    if (parts[0] && parts[0] !== '무기 없음') {
                        parsed.weapons.push({ name: parts[0], dmg: '1d3', desc: parts[2] || '' });
                    }
                }
            } catch (e) {
                console.warn('무기 데이터 파싱 실패. 초기값으로 진행합니다.', e);
            }

            var brawlEl = wpnWrapper.querySelector('.wpn-brawl-display');
            if (brawlEl) brawlEl.innerText = '맨주먹(기본): ' + parsed.brawl;

            var wcl = wpnWrapper.querySelector('.weapon-content-list');
            if (wcl) {
                if (!parsed.weapons.length) {
                    wcl.innerHTML = '<div style="background:rgba(0,0,0,0.4);padding:10px;border-radius:8px;border:1px solid rgba(215,179,61,0.2);text-align:center;color:#aaa;font-size:0.9rem;">장착된 무기가 없습니다.</div>';
                } else {
                    // 무기 목록 동적 생성 (HTML 문자열 결합)
                    wcl.innerHTML = parsed.weapons.map(function (w) {
                        return '<div style="background:rgba(0,0,0,0.4);padding:10px;border-radius:8px;border:1px solid rgba(215,179,61,0.2);text-align:left;">' +
                            '<div style="display:flex;justify-content:space-between;margin-bottom:5px;">' +
                            '<strong style="color:var(--accent-color);">' + w.name + '</strong>' +
                            '<span style="color:#ff4d4d;font-size:0.85rem;font-weight:bold;">[' + w.dmg + ']</span>' +
                            '</div>' +
                            '<div style="color:#aaa;font-size:0.85rem;line-height:1.4;">' + (w.desc || '설명 없음') + '</div>' +
                            '</div>';
                    }).join('');
                }
            }
        }

        /* (8) 인벤토리 데이터 바인딩 
           객체나 배열일 수 있는 데이터를 안전하게 문자열화하여 DOM의 data-* 속성에 저장만 해둡니다.
           실제 렌더링 로직은 Character.js의 전담 함수가 처리합니다. */
        var invWrapper = targetSlide.querySelector('.rpg-inventory');
        if (invWrapper) {
            var raw = profile.inventory;
            // 배열/객체를 문자열로 안전하게 변환 (trim() 제거하여 버그 방지)
            var safeString = typeof raw === 'object' ? JSON.stringify(raw) : (raw || '');
            invWrapper.setAttribute('data-inventory', safeString);
        }

        /* (9) 관계도(Map) 탭의 인물 노드 이미지 동기화 */
        var mapPhase = (typeof currentMapPhase !== 'undefined') ? currentMapPhase : 0;
        if (profile.phase === mapPhase && profile.profile_image) {
            // 더미 4인의 char_id('char-ho1' 등)에서 숫자 등을 추출해 맵 노드와 일치시킵니다.
            var nodeImg = document.querySelector('#map-node-' + profile.char_id.replace('char-', '') + ' img');
            if (nodeImg) nodeImg.src = profile.profile_image;
        }
    });

    /* 모든 데이터가 DOM에 반영된 후 레이더 차트를 일괄적으로 갱신합니다. */
    setTimeout(function () {
        if (typeof window.drawAllRadarCharts === 'function') window.drawAllRadarCharts();
    }, 100);
}


/* ─────────────────────────────────────────────────────────────────
   5. imgbb 이미지 업로드 (써드파티 API 활용)
   프로필, 갤러리 이미지 등을 업로드하여 URL을 반환받습니다.
   Config.js 에 정의된 IMGBB_API_KEY(더미값/실제값)를 사용합니다.
───────────────────────────────────────────────────────────────── */
async function uploadToImgbb(file) {
    var formData = new FormData();
    formData.append('image', file);
    
    try {
        var response = await fetch('https://api.imgbb.com/1/upload?key=' + IMGBB_API_KEY, { 
            method: 'POST', 
            body: formData 
        });
        var result   = await response.json();
        
        // 업로드 성공 시 반환된 이미지의 고유 URL 제공
        return result.success ? result.data.url : null;
    } catch (e) {
        console.error('imgbb 이미지 업로드 실패:', e);
        return null;
    }
}


/* ─────────────────────────────────────────────────────────────────
   6. 색상 변환 유틸
   캐릭터별 테마 컬러 설정 시 HTML Color Picker(HEX)와 차트/CSS용(RGB) 
   포맷 간의 변환을 지원하는 헬퍼 함수입니다.
───────────────────────────────────────────────────────────────── */

/**
 * HEX 코드를 RGB 문자열('R, G, B')로 변환
 */
function hexToRgb(hex) {
    // hex 형태가 '#RRGGBB' 임을 가정
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return r + ', ' + g + ', ' + b;
}

/**
 * RGB 문자열('R, G, B')을 HEX 코드로 변환
 */
function rgbToHex(rgbStr) {
    var parts = rgbStr.split(',').map(function (x) { return parseInt(x.trim()); });
    // 비트 시프트를 이용해 빠르게 HEX 포맷 획득
    return '#' + (1 << 24 | parts[0] << 16 | parts[1] << 8 | parts[2]).toString(16).slice(1);
}
