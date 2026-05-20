/* ================================================================= */
/*  Auth.js — 인증 & DB 공통 유틸                                      */
/*                                                                   */
/*  이 파일이 담당하는 일:                                             */
/*  1. 로그인 / 회원가입 / 로그아웃                                    */
/*  2. 로그인 상태 확인 → 편집 버튼 자동 주입                          */
/*  3. DB upsert 헬퍼 (있으면 수정, 없으면 삽입)                       */
/*  4. DB에서 전체 캐릭터 데이터 불러와 화면 반영                       */
/*  5. imgbb에 이미지 업로드                                           */
/*  6. 색상 변환 유틸 (hex ↔ rgb)                                     */
/*                                                                   */
/*  ⚠️  수정이 필요한 부분은 ✏️ 표시를 찾으세요.                        */
/*  대부분의 경우 이 파일을 직접 수정할 필요는 없습니다.                 */
/* ================================================================= */


/* ─────────────────────────────────────────────────────────────────
   1. 로그인 / 회원가입 / 로그아웃
   ─────────────────────────────────────────────────────────────────
   각 함수는 index.html의 버튼에서 호출됩니다.
   실제 인증 처리는 Supabase Auth 서비스가 담당합니다.
───────────────────────────────────────────────────────────────── */

/**
 * 로그인 처리 함수
 * HTML에서 id="auth-email", id="auth-password" 입력값을 읽어
 * Supabase에 로그인 요청을 보냅니다.
 * 성공하면 페이지를 새로고침(location.reload)해서 로그인 상태를 반영합니다.
 */
window.handleLogin = async function () {
    /* 이메일과 비밀번호 입력창의 값을 가져옵니다 */
    var email    = document.getElementById('auth-email').value;
    var password = document.getElementById('auth-password').value;

    /* Supabase에 로그인 요청 */
    var result = await supabaseClient.auth.signInWithPassword({
        email:    email,
        password: password
    });

    if (result.error) {
        /* 로그인 실패 시 오류 메시지 표시 */
        alert('로그인 실패: ' + result.error.message);
    } else {
        /* 로그인 성공 시 페이지 새로고침 (로그인 상태 반영) */
        location.reload();
    }
};

/**
 * 회원가입 처리 함수
 * 이메일 + 비밀번호로 새 계정을 만듭니다.
 * Supabase에서는 가입 후 이메일 인증을 요구할 수 있습니다.
 * (Supabase 대시보드 → Auth → Settings에서 이메일 인증 끄기 가능)
 */
window.handleSignUp = async function () {
    var email    = document.getElementById('auth-email').value;
    var password = document.getElementById('auth-password').value;

    var result = await supabaseClient.auth.signUp({
        email:    email,
        password: password
    });

    if (result.error) {
        alert('가입 실패: ' + result.error.message);
    } else {
        alert('가입 완료! 이메일을 확인하거나 로그인 해주세요.');
        closeModal('auth-modal'); /* 모달 닫기 */
    }
};

/**
 * 로그아웃 처리 함수
 * Supabase 세션을 종료하고 페이지를 새로고침합니다.
 */
window.signOut = async function () {
    await supabaseClient.auth.signOut();
    location.reload();
};

/**
 * 로그인 모달을 열어줍니다.
 * (nav-btn의 LOGIN 버튼에서 호출)
 */
window.openAuthModal = function () {
    var modal = document.getElementById('auth-modal');
    if (modal) modal.classList.add('show');
};


/* ─────────────────────────────────────────────────────────────────
   2. 로그인 상태 확인 & 편집 버튼 자동 주입
   ─────────────────────────────────────────────────────────────────
   페이지 로드 시 한 번 실행됩니다.
   로그인한 사용자가 있으면:
   - 로그인 버튼을 숨기고 로그아웃 버튼을 표시
   - 자신의 캐릭터 페이지에 편집 버튼들을 자동으로 추가
   - 관리자라면 모든 캐릭터의 소지금 행에 편집 기능 추가
───────────────────────────────────────────────────────────────── */

/**
 * 현재 로그인 상태를 확인하고 UI를 업데이트하는 함수
 * window.load 이벤트에서 자동 호출됩니다.
 */
async function checkLoginState() {
    /* supabaseClient가 초기화되지 않았으면 종료 */
    if (!supabaseClient) return;

    /* 현재 로그인된 사용자 정보 가져오기 */
    var user = null;
    try {
        var res  = await supabaseClient.auth.getUser();
        user     = (res.data && res.data.user) ? res.data.user : null;
    } catch (e) {
        console.warn('사용자 정보 가져오기 실패:', e);
        return;
    }

    /* 전역 변수 currentUser에 저장 (다른 파일에서 참조) */
    currentUser = user;

    /* 로그인 / 로그아웃 버튼 표시 전환 */
    var loginBtn  = document.getElementById('login-btn');
    var logoutBtn = document.getElementById('logout-btn');

    /* 로그인된 사용자가 없으면 여기서 종료 (편집 버튼 필요 없음) */
    if (!user) return;

    /* 로그인 버튼 숨기고 로그아웃 버튼 표시 */
    if (loginBtn)  loginBtn.style.display  = 'none';
    if (logoutBtn) logoutBtn.style.display = 'inline-block';

    /* ── 관리자 전용: 소지금 행 클릭 시 편집 모달 열기 ── */
    if (adminEmails.includes(user.email)) {
        /*
         * .money-row 클래스를 가진 모든 요소에 편집 가능 스타일과 클릭 이벤트를 추가합니다.
         * Config.js의 adminEmails 배열에 이메일이 있는 사람만 이 기능을 사용할 수 있습니다.
         */
        document.querySelectorAll('.money-row').forEach(function (row) {
            row.classList.add('editable-area'); /* 마우스 올리면 'Edit' 표시 */
            row.onclick = function () {
                /* 가장 가까운 부모 .content-card의 id를 캐릭터 ID로 사용 */
                var charId     = row.closest('.content-card') ? row.closest('.content-card').id : null;
                /* 현재 보이는 챕터(phase) 인덱스 계산 */
                var slide      = row.closest('.phase-slide');
                var phaseIndex = slide ? Array.from(slide.parentNode.children).indexOf(slide) : 0;

                if (typeof window.openMoneyModal === 'function') {
                    window.openMoneyModal(charId, phaseIndex);
                }
            };
        });
    }

    /* ── 본인 캐릭터 편집 버튼 주입 ── */
    /*
     * Config.js의 charOwners에서 현재 로그인한 이메일로 본인 캐릭터 ID를 찾습니다.
     * 예: { 'user@example.com': 'char-가나' } 이면 myCharId = 'char-가나'
     */
    var myCharId = charOwners[user.email];
    if (!myCharId) return; /* charOwners에 등록되지 않은 사용자는 편집 불가 */

    /* 본인 캐릭터 섹션(section) 요소 찾기 */
    var section = document.getElementById(myCharId);
    if (!section) return;

    /* Config.js charData에서 본인 캐릭터 기초 데이터 찾기 (테마 색상 등에 사용) */
    var base = charData.find(function (c) {
        return c.id === myCharId.replace('char-', '');
    });

    /* ── 한마디(quote) 편집 버튼 추가 ── */
    /*
     * .char-quote 영역마다 연필 버튼(✎)을 추가합니다.
     * 클릭하면 기본 정보 편집 모달(openGeneralModal)이 열립니다.
     */
    section.querySelectorAll('.char-quote').forEach(function (quoteEl, i) {
        /* 이미 버튼이 있으면 중복 추가하지 않음 */
        if (quoteEl.querySelector('.edit-icon-btn')) return;

        var btn        = document.createElement('button');
        btn.className  = 'edit-icon-btn';
        btn.innerHTML  = '&#9998;'; /* ✎ 연필 모양 기호 */
        btn.title      = '한마디 편집';
        btn.onclick    = function () { openGeneralModal(myCharId, i); };

        /* 테마 색상 적용 (base가 있을 때만) */
        if (base) btn.style.backgroundColor = 'rgb(' + base.color + ')';

        quoteEl.appendChild(btn);
    });

    /* ── 레이더 차트 클릭 → 능력치 편집 모달 ── */
    section.querySelectorAll('.radar-chart').forEach(function (chartEl, i) {
        chartEl.classList.add('editable-area');
        chartEl.title   = '능력치 편집';
        chartEl.onclick = function () { openStatsModal(myCharId, i); };
    });

    /* ── 무기 영역 클릭 → 무기/전투 스탯 편집 모달 ── */
    section.querySelectorAll('.weapon-display-wrapper').forEach(function (wpnEl, i) {
        wpnEl.classList.add('editable-area');
        wpnEl.title   = '무기 편집';
        wpnEl.onclick = function () { openWeaponModal(myCharId, i); };
    });

    /* ── 인벤토리 클릭 → 인벤토리 편집 모달 ── */
    /*
     * 인벤토리를 클릭하면 편집 모달이 열립니다.
     * 동시에 인벤토리 헤더에 '우편함 열기' 버튼도 추가합니다.
     */
    section.querySelectorAll('.rpg-inventory').forEach(function (invEl, i) {
        invEl.classList.add('editable-area');
        invEl.title   = '인벤토리 편집';
        invEl.onclick = function () { openInvModal(myCharId, i); };

        /* 인벤토리 바로 앞의 헤더 래퍼에 우편함 버튼 추가 */
        var headerWrap = invEl.previousElementSibling;
        if (
            headerWrap &&
            headerWrap.classList.contains('inv-header-wrapper') &&
            !headerWrap.querySelector('.open-mailbox-btn') /* 중복 방지 */
        ) {
            var mailBtn       = document.createElement('button');
            mailBtn.className = 'open-mailbox-btn';
            mailBtn.textContent = '우편함 열기';
            mailBtn.onclick   = function (e) {
                e.stopPropagation(); /* 인벤토리 클릭 이벤트가 함께 발동하지 않도록 차단 */
                openMailboxModal(myCharId, i);
            };
            headerWrap.appendChild(mailBtn);
        }
    });
}


/* ─────────────────────────────────────────────────────────────────
   3. upsert 헬퍼 — DB에 데이터 저장 (있으면 수정, 없으면 삽입)
   ─────────────────────────────────────────────────────────────────
   upsert = update + insert 의 합성어.
   해당 캐릭터+챕터 행이 DB에 있으면 UPDATE, 없으면 INSERT 합니다.
   
   매개변수:
     updates : 저장할 데이터 객체. 예) { quote: '안녕', age: '20' }
   
   반환값:
     Supabase 응답 객체. error 속성이 있으면 실패.
───────────────────────────────────────────────────────────────── */

/**
 * character_profiles 테이블에 데이터를 저장합니다.
 * currentEditingId (현재 편집 중인 캐릭터 ID) 와
 * currentEditingPhase (현재 챕터 인덱스) 를 기준으로 행을 찾습니다.
 */
async function upsertProfileData(updates) {
    /* 클라이언트나 편집 대상이 없으면 에러 반환 */
    if (!supabaseClient || !currentEditingId) {
        return { error: 'supabaseClient 또는 currentEditingId 없음' };
    }

    try {
        /* 먼저 해당 행이 존재하는지 조회 */
        var selectResult = await supabaseClient
            .from('character_profiles')
            .select('char_id')
            .eq('char_id', currentEditingId)      /* 캐릭터 ID 일치 */
            .eq('phase',   currentEditingPhase);  /* 챕터 번호 일치 */

        if (selectResult.data && selectResult.data.length > 0) {
            /* ── 행이 있으면 UPDATE ── */
            return await supabaseClient
                .from('character_profiles')
                .update(updates)
                .eq('char_id', currentEditingId)
                .eq('phase',   currentEditingPhase);
        } else {
            /* ── 행이 없으면 INSERT (char_id, phase 포함해서) ── */
            var newRow = Object.assign({}, updates, {
                char_id: currentEditingId,
                phase:   currentEditingPhase
            });
            return await supabaseClient
                .from('character_profiles')
                .insert([newRow]);
        }
    } catch (e) {
        console.error('upsertProfileData 오류:', e);
        return { error: e };
    }
}


/* ─────────────────────────────────────────────────────────────────
   4. DB에서 전체 캐릭터 데이터 불러와 화면 반영
   ─────────────────────────────────────────────────────────────────
   페이지 로드 시 또는 데이터 저장 후 호출됩니다.
   character_profiles 테이블의 모든 행을 가져와서
   각 캐릭터 페이지의 HTML 요소에 값을 직접 넣어줍니다.
───────────────────────────────────────────────────────────────── */

/**
 * Supabase에서 캐릭터 프로필 데이터 전체를 가져와 화면에 반영합니다.
 * 이 함수는 Character.js가 생성한 HTML 구조를 기반으로 동작합니다.
 */
async function loadCharacterData() {
    if (!supabaseClient) return;

    /* character_profiles 테이블에서 모든 행 가져오기 */
    var fetched;
    try {
        fetched = await supabaseClient.from('character_profiles').select('*');
    } catch (e) {
        console.error('loadCharacterData fetch 오류:', e);
        return;
    }
    if (fetched.error) {
        console.error('loadCharacterData DB 오류:', fetched.error);
        return;
    }

    /* 전역 변수 allProfiles에 저장 (다른 파일에서 참조) */
    allProfiles = fetched.data || [];

    /* 각 프로필을 순회하며 해당 캐릭터의 HTML 요소에 값 주입 */
    allProfiles.forEach(function (profile) {
        /* 해당 캐릭터의 section 요소 찾기. 없으면 건너뜀. */
        var section = document.getElementById(profile.char_id);
        if (!section) return;

        /* phase = 챕터 번호 (0=1부, 1=2부, ...) */
        var phaseIdx    = profile.phase || 0;
        var targetSlide = section.querySelectorAll('.phase-slide')[phaseIdx];
        if (!targetSlide) return;

        /* ── 프로필 이미지 교체 ── */
        var profImg = targetSlide.querySelector('.main-profile-img');
        if (profImg && profile.profile_image) {
            profImg.src = profile.profile_image;
        }

        /* ── 한마디 텍스트 교체 ── */
        var quoteTxt = targetSlide.querySelector('.quote-text');
        if (quoteTxt && profile.quote) {
            quoteTxt.innerText = profile.quote;
        }

        /* ── 기본 정보 (직업, 나이, 거주지) 교체 ── */
        /*
         * .info-value 요소는 순서대로:
         * [0] = 이름 (수정하지 않음)
         * [1] = 직업
         * [2] = 나이
         * [3] = 거주지
         */
        var infoValues = targetSlide.querySelectorAll('.info-value');
        if (infoValues.length >= 4) {
            infoValues[1].innerText = profile.job       || '?';
            infoValues[2].innerText = profile.age       || '?';
            infoValues[3].innerText = profile.residence || '?';
        }

        /* ── 백스토리 텍스트 교체 ── */
        var introEl = targetSlide.querySelector('.section-intro');
        if (introEl && profile.backstory) {
            introEl.innerText = profile.backstory;
        }

        /* ── 능력치 & 테마 색상 (레이더 차트용) ── */
        /*
         * .stats-wrapper의 data-stats, data-color 속성을 갱신합니다.
         * Radar.js의 drawAllRadarCharts()가 이 속성을 읽어 차트를 그립니다.
         */
        var statsWrapper = targetSlide.querySelector('.stats-wrapper');
        if (statsWrapper) {
            if (profile.stats)       statsWrapper.setAttribute('data-stats', profile.stats);
            if (profile.chart_color) statsWrapper.setAttribute('data-color', profile.chart_color);
        }

        /* ── 소지금 표시 ── */
        var moneyDisplay = targetSlide.querySelector('.money-display');
        if (moneyDisplay) {
            var moneyNum = profile.money ? parseInt(profile.money) : 0;
            moneyDisplay.innerText = moneyNum.toLocaleString() + ' G';
        }

        /* ── 무기 데이터 반영 ── */
        var wpnWrapper = targetSlide.querySelector('.weapon-display-wrapper');
        if (wpnWrapper) {
            var rawWeaponData = profile.weapon_data || '{}';
            wpnWrapper.setAttribute('data-weapon', rawWeaponData);

            /* weapon_data를 파싱해서 화면에 표시할 HTML 생성 */
            var parsed = { brawl: 25, weapons: [] };
            try {
                var tmp    = JSON.parse(rawWeaponData);
                parsed.brawl   = tmp.brawl   || 25;
                parsed.weapons = tmp.weapons  || [];
            } catch (e) {
                /* 파싱 실패 시 기본값 유지 */
            }

            /* 근접 격투 수치 표시 */
            var brawlEl = wpnWrapper.querySelector('.wpn-brawl-display');
            if (brawlEl) {
                brawlEl.innerText = 'Brawl: ' + parsed.brawl;
            }

            /* 무기 목록 HTML 생성 */
            var weaponListEl = wpnWrapper.querySelector('.weapon-content-list');
            if (weaponListEl) {
                if (!parsed.weapons.length) {
                    /* 무기가 없을 때 안내 문구 */
                    weaponListEl.innerHTML =
                        '<div style="background:rgba(255,255,255,0.02); padding:10px; border-radius:8px;' +
                        'text-align:center; color:#555; font-size:0.9rem;">No weapons equipped.</div>';
                } else {
                    /* 무기 목록 카드 생성 */
                    weaponListEl.innerHTML = parsed.weapons.map(function (w) {
                        return '<div style="background:rgba(255,255,255,0.02); padding:10px; border-radius:8px;' +
                            'border:1px solid rgba(255,255,255,0.05); text-align:left; margin-bottom:6px;">' +
                            '<div style="display:flex; justify-content:space-between; margin-bottom:4px;">' +
                            '<strong style="color:#aaa;">' + w.name + '</strong>' +
                            '<span style="color:#888; font-size:0.85rem;">[' + w.dmg + ']</span>' +
                            '</div>' +
                            '<div style="color:#555; font-size:0.82rem;">' + (w.desc || '') + '</div>' +
                            '</div>';
                    }).join('');
                }
            }
        }

        /* ── 인벤토리 데이터 저장 (렌더링은 Character.js가 담당) ── */
        /*
         * Character.js의 _reRenderAllInventories() 함수가 이 속성을 읽어 렌더링합니다.
         * 여기서는 속성에 데이터만 저장해둡니다.
         */
        var invWrapper = targetSlide.querySelector('.rpg-inventory');
        if (invWrapper) {
            var rawInv = profile.inventory;
            var safeStr = typeof rawInv === 'object'
                ? JSON.stringify(rawInv)
                : (rawInv || '');
            invWrapper.setAttribute('data-inventory', safeStr);
        }
    });

    /* 데이터 반영 후 레이더 차트 다시 그리기 */
    setTimeout(function () {
        if (typeof window.drawAllRadarCharts === 'function') {
            window.drawAllRadarCharts();
        }
    }, 100);
}


/* ─────────────────────────────────────────────────────────────────
   5. imgbb에 이미지 업로드
   ─────────────────────────────────────────────────────────────────
   imgbb.com은 무료 이미지 호스팅 서비스입니다.
   API 키는 Config.js의 IMGBB_API_KEY에 입력하세요.
   
   매개변수:
     file : File 객체 (input[type=file]로 선택한 파일)
   
   반환값:
     업로드 성공 시 이미지 URL (string), 실패 시 null
───────────────────────────────────────────────────────────────── */

/**
 * 이미지 파일을 imgbb에 업로드하고 URL을 반환합니다.
 * 프로필 이미지, 인벤토리 아이템 이미지 등 모든 이미지 업로드에 사용됩니다.
 */
async function uploadToImgbb(file) {
    /* FormData에 이미지 파일을 담아 multipart/form-data 형식으로 전송 */
    var formData = new FormData();
    formData.append('image', file);

    try {
        var response = await fetch(
            'https://api.imgbb.com/1/upload?key=' + IMGBB_API_KEY,
            { method: 'POST', body: formData }
        );
        var result = await response.json();

        /* 업로드 성공이면 이미지 URL 반환, 실패면 null */
        return result.success ? result.data.url : null;
    } catch (e) {
        console.error('imgbb 업로드 실패:', e);
        return null;
    }
}


/* ─────────────────────────────────────────────────────────────────
   6. 색상 변환 유틸
   ─────────────────────────────────────────────────────────────────
   테마 색상은 'R, G, B' 형식(예: '200, 200, 200')으로 DB에 저장됩니다.
   HTML <input type="color">는 '#cccccc' 형식(hex)을 사용하므로
   두 형식 간 변환이 필요합니다.
───────────────────────────────────────────────────────────────── */

/**
 * '#cccccc' 형식의 hex 색상 → 'R, G, B' 형식으로 변환
 * 예) hexToRgb('#cccccc') → '204, 204, 204'
 */
function hexToRgb(hex) {
    var r = parseInt(hex.slice(1, 3), 16); /* 첫 두 자리 = 빨강(Red) */
    var g = parseInt(hex.slice(3, 5), 16); /* 중간 두 자리 = 초록(Green) */
    var b = parseInt(hex.slice(5, 7), 16); /* 마지막 두 자리 = 파랑(Blue) */
    return r + ', ' + g + ', ' + b;
}

/**
 * 'R, G, B' 형식 → '#rrggbb' hex 형식으로 변환
 * 예) rgbToHex('204, 204, 204') → '#cccccc'
 */
function rgbToHex(rgbStr) {
    /* 쉼표로 나누고 각 숫자를 정수로 변환 */
    var parts = rgbStr.split(',').map(function (x) {
        return parseInt(x.trim());
    });
    /* 비트 연산으로 hex 문자열 조합 후 '#' 접두사 추가 */
    return '#' + (1 << 24 | parts[0] << 16 | parts[1] << 8 | parts[2])
        .toString(16)
        .slice(1);
}
