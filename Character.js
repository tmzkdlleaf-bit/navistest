/* ================================================================= */
/*  Character.js — 캐릭터 페이지 빌드 & 편집 모달 처리                  */
/*                                                                   */
/*  이 파일이 담당하는 일:                                             */
/*  1. Config.js의 charData를 읽어 캐릭터 페이지 HTML 자동 생성        */
/*  2. 기본 정보 편집 모달 (프로필 이미지, 한마디, 직업, 나이 등)        */
/*  3. 능력치 편집 모달 (레이더 차트 8개 수치)                          */
/*  4. 무기/전투 스탯 편집 모달                                        */
/*  5. 인벤토리 편집 모달 (아이템 추가/삭제/수정)                       */
/*  6. 우편함 (캐릭터 간 아이템 선물)                                  */
/*  7. 소지금 관리 모달 (증가/감소)                                    */
/*                                                                   */
/*  ⚠️  이 파일은 수정할 부분이 거의 없습니다.                           */
/*  캐릭터 데이터 변경은 Config.js에서 하세요.                          */
/* ================================================================= */


/* ─────────────────────────────────────────────────────────────────
   1. 캐릭터 페이지 HTML 자동 생성
   ─────────────────────────────────────────────────────────────────
   Config.js의 charData 배열을 읽어서 각 캐릭터의 섹션을
   동적으로 생성합니다.
   생성된 HTML은 index.html의 #character-pages-container 안에 삽입됩니다.
───────────────────────────────────────────────────────────────── */

/**
 * 모든 캐릭터 페이지를 HTML로 생성하여 DOM에 삽입합니다.
 * 페이지 로드 시 window.load 이벤트에서 한 번 호출됩니다.
 */
function initCharacterPages() {
    var html = '';

    /* Config.js의 charData 배열을 순회 */
    charData.forEach(function (c) {

        /*
         * 각 챕터(1부~4부) 슬라이드 HTML을 미리 만들어 둡니다.
         * 4개의 슬라이드가 동일한 구조로 생성되며,
         * DB에서 불러온 데이터(loadCharacterData)가 각 슬라이드에 채워집니다.
         */
        var slides = '';
        for (var i = 0; i < 4; i++) {
            /* i=0이면 'active' 클래스를 붙여 처음에 표시 */
            slides +=
                '<div class="phase-slide ' + (i === 0 ? 'active' : '') + '">' +

                    /* ── 캐릭터 이름 & 시트 링크 ── */
                    '<div class="char-header-row">' +
                        '<h2>' + c.title + ' · ' + c.name + '</h2>' +
                        /* ✏️  시트 링크가 있으면 href를 실제 URL로 교체하세요 */
                        '<a href="#" class="link-btn">Character Sheet</a>' +
                    '</div>' +

                    /* ── 프로필 개요 (이미지 + 기본 정보) ── */
                    '<div class="profile-overview">' +

                        /* 프로필 이미지 (클릭하면 라이트박스로 크게 보기) */
                        '<img src="' + c.img + '" class="main-profile-img" onclick="openLightbox(this.src)">' +

                        /* 오른쪽 정보 영역 */
                        '<div class="profile-info-wrapper">' +

                            /* 한마디 대사 (편집 가능 — Auth.js에서 버튼 자동 주입) */
                            '<div class="char-quote">' +
                                '<span class="quote-mark" style="color:rgb(' + c.color + ');">"</span>' +
                                '<p class="quote-text">' + c.quote + '</p>' +
                            '</div>' +

                            '<div class="divider-dots">• • •</div>' +

                            /* 기본 정보 테이블 */
                            '<div class="info-table">' +
                                '<div class="info-row"><span class="info-label">Name</span>     <span class="info-value">' + c.name + '</span></div>' +
                                '<div class="info-row"><span class="info-label">Job</span>      <span class="info-value">?</span></div>' +  /* DB에서 채워짐 */
                                '<div class="info-row"><span class="info-label">Age</span>      <span class="info-value">?</span></div>' +
                                '<div class="info-row"><span class="info-label">Location</span> <span class="info-value">?</span></div>' +
                                /* 소지금 행 — 관리자가 클릭해서 편집 가능 (Auth.js에서 이벤트 추가) */
                                '<div class="info-row money-row"><span class="info-label">Balance</span><span class="info-value money-display">0 G</span></div>' +
                            '</div>' +

                        '</div>' +
                    '</div>' +

                    '<div class="divider-dots">• • •</div>' +

                    /* ── 능력치 영역 (레이더 차트 + 무기 + 인벤토리) ── */
                    /*
                     * data-stats: 능력치 8개 (Radar.js에서 읽어 차트를 그림)
                     * data-color: 차트 색상 (RGB 문자열)
                     * 레이아웃: 좌측=레이더차트, 우측=무기, 하단=인벤토리
                     */
                    '<div class="stats-wrapper" data-stats="' + c.stats + '" data-color="' + c.color + '">' +

                        /* 좌측: 레이더 차트 컨테이너 */
                        '<div class="radar-chart-container">' +
                            '<svg class="radar-chart" viewBox="0 0 200 200"></svg>' +
                        '</div>' +

                        /* 우측: 무기 & 전투 정보 */
                        '<div class="weapon-display-wrapper" data-weapon="{}">' +
                            '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">' +
                                '<h3 style="margin:0; font-family:\'Nanum Myeongjo\',serif; color:#aaa; font-size:1rem;">Weapon & Combat</h3>' +
                                '<span class="wpn-brawl-display">Brawl: 25</span>' +
                            '</div>' +
                            '<div class="weapon-content-list">' +
                                '<div style="background:rgba(255,255,255,0.02); padding:10px; border-radius:8px; text-align:center; color:#555; font-size:0.88rem;">No weapons equipped.</div>' +
                            '</div>' +
                        '</div>' +

                        /* 하단 전체: 인벤토리 */
                        '<div style="grid-column:1/-1; grid-row:2; width:100%; margin-top:20px;">' +
                            /* 인벤토리 헤더 (우편함 버튼이 Auth.js에서 자동 추가됨) */
                            '<div class="inv-header-wrapper" style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">' +
                                '<h3 style="margin:0; font-family:\'Nanum Myeongjo\',serif; color:#aaa; font-size:1rem; letter-spacing:1px;">Inventory</h3>' +
                            '</div>' +
                            /* 인벤토리 슬롯 그리드 (initDefaultInventories에서 빈 슬롯 채워짐) */
                            '<div class="rpg-inventory"></div>' +
                        '</div>' +

                    '</div>' + /* /stats-wrapper */

                    '<div class="divider-dots">• • •</div>' +

                    /* ── 백스토리 영역 ── */
                    '<h2>Backstory</h2>' +
                    '<p class="section-intro" style="color:#666; line-height:1.8;">—</p>' +

                    /* ── 분기/상세 기록 (접을 수 있는 details) ── */
                    /* ✏️  여기에 details 태그를 추가해서 챕터별 이야기를 기록하세요 */
                    '<details><summary>Event 1</summary><div class="details-content">내용을 입력하세요.</div></details>' +

                '</div>'; /* /phase-slide */
        }

        /* ── 캐릭터 섹션 전체 HTML ── */
        html +=
            '<section id="char-' + c.id + '" class="content-card">' +

                /* 챕터 전환 탭 (1부/2부/3부/4부) */
                '<div class="phase-tabs">' +
                    '<button class="phase-btn active" onclick="changePhase(this,0)">Chapter 1</button>' +
                    '<button class="phase-btn"        onclick="changePhase(this,1)">Chapter 2</button>' +
                    '<button class="phase-btn"        onclick="changePhase(this,2)">Chapter 3</button>' +
                    '<button class="phase-btn"        onclick="changePhase(this,3)">Chapter 4</button>' +
                '</div>' +

                /* 슬라이드 컨테이너 */
                '<div class="phase-content-wrapper">' + slides + '</div>' +

            '</section>';
    });

    /* 생성된 HTML을 컨테이너에 삽입 */
    document.getElementById('character-pages-container').innerHTML = html;

    /* HTML 삽입 후 레이더 차트 그리기 */
    if (typeof drawAllRadarCharts === 'function') drawAllRadarCharts();
}

/**
 * 모든 인벤토리 그리드에 빈 슬롯을 채워 20칸을 만듭니다.
 * (각 슬라이드마다 rpg-inventory가 20칸을 가져야 함)
 */
function initDefaultInventories() {
    document.querySelectorAll('.rpg-inventory').forEach(function (inv) {
        /* 현재 슬롯 수가 20개 미만이면 빈 슬롯 추가 */
        while (inv.querySelectorAll('.inv-slot').length < 20) {
            inv.insertAdjacentHTML('beforeend', '<div class="inv-slot"></div>');
        }
    });
}


/* ─────────────────────────────────────────────────────────────────
   2. 기본 정보 편집 모달
   ─────────────────────────────────────────────────────────────────
   Auth.js에서 주입한 연필 버튼을 클릭하면 이 모달이 열립니다.
   프로필 이미지, 한마디, 직업, 나이, 거주지, 테마 색상, BGM, 백스토리를 수정합니다.
───────────────────────────────────────────────────────────────── */

/**
 * 기본 정보 편집 모달을 엽니다.
 * 현재 값들을 모달 입력창에 미리 채워줍니다.
 *
 * 매개변수:
 *   charId     : 편집할 캐릭터 섹션 id (예: 'char-가나')
 *   phaseIndex : 현재 보고 있는 챕터 인덱스 (0~3)
 */
window.openGeneralModal = function (charId, phaseIndex) {
    /* 본인 캐릭터인지 확인 */
    var myCharId = currentUser ? charOwners[currentUser.email] : null;
    if (myCharId !== charId) {
        alert('본인의 캐릭터 정보만 수정할 수 있습니다.');
        return;
    }

    /* 전역 편집 대상 업데이트 (upsertProfileData에서 사용) */
    currentEditingId    = charId;
    currentEditingPhase = phaseIndex;

    /* 현재 화면에 표시된 해당 챕터 슬라이드를 찾아서 현재 값 읽기 */
    var targetSlide = document.getElementById(charId)
        .querySelectorAll('.phase-slide')[phaseIndex];
    var infoValues  = targetSlide.querySelectorAll('.info-value');

    /* 모달 제목 설정 */
    document.getElementById('edit-modal-title').innerText = infoValues[0].innerText + ' — Edit Profile';

    /* 현재 값들을 모달 입력창에 미리 채우기 */
    document.getElementById('current-profile-img').value = targetSlide.querySelector('.main-profile-img').src;
    document.getElementById('edit-quote').value          = targetSlide.querySelector('.quote-text').innerText;
    document.getElementById('edit-job').value            = infoValues[1].innerText.replace('?', '').trim();
    document.getElementById('edit-age').value            = infoValues[2].innerText.replace('?', '').trim();
    document.getElementById('edit-residence').value      = infoValues[3].innerText.replace('?', '').trim();
    document.getElementById('edit-backstory').value      = targetSlide.querySelector('.section-intro')?.innerText || '';

    /* 현재 테마 색상(RGB)을 hex로 변환해서 color 입력창에 채우기 */
    var currentRgb = targetSlide.querySelector('.stats-wrapper')
        .getAttribute('data-color') || '200, 200, 200';
    document.getElementById('edit-theme-color').value = rgbToHex(currentRgb);

    /* DB에서 BGM URL 불러오기 */
    var profile = (typeof allProfiles !== 'undefined')
        ? allProfiles.find(function (p) {
            return p.char_id === charId && p.phase === phaseIndex;
          })
        : null;
    var bgmInput = document.getElementById('edit-bgm-url');
    if (bgmInput) {
        bgmInput.value = (profile && profile.bgm_url) ? profile.bgm_url : '';
    }

    /* 모달 표시 */
    document.getElementById('edit-modal').classList.add('show');
};

/**
 * 기본 정보 편집 모달에서 '저장' 버튼을 누르면 호출됩니다.
 * 입력된 값들을 DB에 저장하고 화면을 갱신합니다.
 */
window.saveGeneralData = async function () {
    var btn = document.getElementById('save-btn');
    btn.innerText = 'Saving...';
    btn.disabled  = true;

    /* 프로필 이미지 처리: 새 파일을 선택했으면 imgbb에 업로드 */
    var finalImgUrl = document.getElementById('current-profile-img').value;
    var fileInput   = document.getElementById('edit-profile-file');

    if (fileInput.files.length > 0) {
        btn.innerText = 'Uploading image...';
        var uploadedUrl = await uploadToImgbb(fileInput.files[0]);
        if (uploadedUrl) {
            finalImgUrl = uploadedUrl; /* 업로드된 URL로 교체 */
        } else {
            alert('이미지 업로드에 실패했습니다. 다시 시도해주세요.');
        }
    }

    /* hex 색상 → RGB 문자열 변환 (DB 저장 형식) */
    var hexColor = document.getElementById('edit-theme-color').value;
    var bgmUrl   = document.getElementById('edit-bgm-url')
        ? document.getElementById('edit-bgm-url').value.trim()
        : '';

    /* DB에 저장 */
    var result = await upsertProfileData({
        profile_image: finalImgUrl,
        quote:         document.getElementById('edit-quote').value,
        job:           document.getElementById('edit-job').value,
        age:           document.getElementById('edit-age').value,
        residence:     document.getElementById('edit-residence').value,
        backstory:     document.getElementById('edit-backstory').value,
        chart_color:   hexToRgb(hexColor),
        bgm_url:       bgmUrl,
    });

    btn.innerText = 'Save Changes';
    btn.disabled  = false;

    if (result && result.error) {
        alert('저장에 실패했습니다: ' + result.error.message);
    } else {
        await loadCharacterData(); /* 화면에 반영 */
        closeModal('edit-modal');
    }
};


/* ─────────────────────────────────────────────────────────────────
   3. 능력치 편집 모달
   ─────────────────────────────────────────────────────────────────
   레이더 차트 위치 클릭 시 열립니다.
   근력/건강/크기/민첩/외모/지능/정신/교육 8개 수치를 수정합니다.
───────────────────────────────────────────────────────────────── */

/**
 * 능력치 편집 모달을 엽니다.
 *
 * 매개변수:
 *   charId     : 편집할 캐릭터 섹션 id
 *   phaseIndex : 현재 챕터 인덱스
 */
window.openStatsModal = function (charId, phaseIndex) {
    currentEditingId    = charId;
    currentEditingPhase = phaseIndex;

    /* 현재 능력치 문자열 가져오기 (쉼표로 구분된 숫자 8개) */
    var statsStr = document.getElementById(charId)
        .querySelectorAll('.phase-slide')[phaseIndex]
        .querySelector('.stats-wrapper')
        .getAttribute('data-stats') || '50,50,50,50,50,50,50,50';

    /* 쉼표로 분리해서 숫자 배열로 변환 */
    var statsArray = statsStr.split(',').map(Number);

    /* 입력 필드 HTML 생성 */
    var html = '';
    for (var i = 0; i < 8; i++) {
        html +=
            '<div style="display:flex; justify-content:space-between; align-items:center;">' +
                '<span style="color:#aaa; font-weight:bold;">' + STAT_LABELS[i] + '</span>' +
                /* STAT_LABELS는 Config.js에서 정의: ['근력','건강','크기','민첩','외모','지능','정신','교육'] */
                '<input type="number" id="stat-input-' + i + '" value="' + (statsArray[i] || 50) + '"' +
                ' class="modal-inline-input" style="width:65px; text-align:center; margin-bottom:0;" min="0" max="100">' +
            '</div>';
    }

    document.getElementById('stats-inputs-container').innerHTML = html;
    document.getElementById('stats-modal').classList.add('show');
};

/**
 * 능력치 모달에서 '저장' 버튼을 누르면 호출됩니다.
 */
window.saveStatsToDB = async function () {
    var btn = document.getElementById('stats-save-btn');
    btn.innerText = 'Applying...';
    btn.disabled  = true;

    /* 8개 입력창에서 값 읽기 */
    var newStats = [];
    for (var i = 0; i < 8; i++) {
        var val = document.getElementById('stat-input-' + i).value;
        newStats.push(val || 50); /* 비어있으면 기본값 50 */
    }

    /* 쉼표로 연결해서 DB에 저장 */
    var result = await upsertProfileData({ stats: newStats.join(',') });

    btn.innerText = 'Apply Stats';
    btn.disabled  = false;

    if (result && result.error) {
        alert('저장 실패');
    } else {
        await loadCharacterData(); /* 화면의 레이더 차트도 업데이트됨 */
        closeModal('stats-modal');
    }
};


/* ─────────────────────────────────────────────────────────────────
   4. 무기 & 전투 스탯 편집 모달
   ─────────────────────────────────────────────────────────────────
   무기 영역 클릭 시 열립니다.
   HP, MP, 각 전투 기능치, 무기 목록을 수정합니다.
───────────────────────────────────────────────────────────────── */

/**
 * 무기/전투 스탯 편집 모달을 엽니다.
 * DB에서 weapon_data를 불러와 각 입력창에 채워줍니다.
 */
window.openWeaponModal = async function (charId, phaseIndex) {
    if (!currentUser) { alert('로그인이 필요합니다.'); return; }

    var myCharId = charOwners[currentUser.email];
    if (myCharId !== charId) { alert('본인 캐릭터만 수정할 수 있습니다.'); return; }

    currentEditingId    = charId;
    currentEditingPhase = phaseIndex;

    /* DB에서 weapon_data 조회 */
    var res = await supabaseClient
        .from('character_profiles')
        .select('weapon_data, stats')
        .eq('char_id', charId)
        .eq('phase',   phaseIndex)
        .single();

    /* 무기 목록 컨테이너 초기화 */
    document.getElementById('weapon-list-container').innerHTML = '';

    /* 모든 입력창 초기화 */
    var inputIds = [
        'edit-hp-stat','edit-mp-stat','edit-brawl-stat','edit-sword-stat',
        'edit-bow-stat','edit-throw-stat','edit-magic-stat','edit-dodge-stat',
        'edit-drive-stat','edit-bp-stat','edit-firstaid-stat','edit-medic-stat',
    ];
    inputIds.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
    });

    /* DB 데이터가 있으면 파싱해서 입력창에 채우기 */
    if (res.data && res.data.weapon_data) {
        try {
            var w = typeof res.data.weapon_data === 'string'
                ? JSON.parse(res.data.weapon_data)
                : res.data.weapon_data;

            /* 각 입력창에 값 설정 */
            var setVal = function (id, val) {
                var el = document.getElementById(id);
                if (el && val != null) el.value = val;
            };

            setVal('edit-hp-stat',       w.maxHp);
            setVal('edit-mp-stat',       w.maxMp);
            setVal('edit-brawl-stat',    w.brawl);
            setVal('edit-sword-stat',    w.sword);
            setVal('edit-bow-stat',      w.bow);
            setVal('edit-throw-stat',    w.throw);
            setVal('edit-magic-stat',    w.magic);
            setVal('edit-dodge-stat',    w.dodge);
            setVal('edit-drive-stat',    w.drive);
            setVal('edit-bp-stat',       w.bp);
            setVal('edit-firstaid-stat', w.firstaid);
            setVal('edit-medic-stat',    w.medic);

            /* 무기 목록 렌더링 */
            (w.weapons || []).forEach(function (wp) {
                window.addWeaponRow(wp.name, wp.dmg, wp.type || 'brawl', wp.desc || '');
            });
        } catch (e) {
            console.warn('weapon_data 파싱 오류:', e);
        }
    }

    document.getElementById('weapon-modal').classList.add('show');
};

/**
 * 무기 목록에 새 행을 추가합니다.
 * '무기 추가' 버튼 또는 기존 데이터 로드 시 호출됩니다.
 *
 * 매개변수 (모두 선택 사항 — 빈 행 추가 시 생략 가능):
 *   name : 무기 이름
 *   dmg  : 피해 주사위 (예: '1d6')
 *   type : 기능치 종류 ('brawl','sword','bow','throw','magic')
 *   desc : 비고/설명
 */
window.addWeaponRow = function (name, dmg, type, desc) {
    var container = document.getElementById('weapon-list-container');
    if (!container) return;

    /* 무기 종류 선택 옵션 */
    var typeOptions = [
        { val: 'brawl', label: 'Brawl (격투)' },
        { val: 'sword', label: 'Sword (도검)' },
        { val: 'bow',   label: 'Bow (활)' },
        { val: 'throw', label: 'Throw (투척)' },
        { val: 'magic', label: 'Magic (도술)' },
    ];

    var selectOpts = typeOptions.map(function (o) {
        var selected = (o.val === (type || 'brawl')) ? ' selected' : '';
        return '<option value="' + o.val + '"' + selected + '>' + o.label + '</option>';
    }).join('');

    var row = document.createElement('div');
    row.className  = 'weapon-row';
    row.style.cssText = [
        'display:flex', 'gap:8px', 'align-items:center',
        'background:rgba(255,255,255,0.02)', 'border:1px solid rgba(255,255,255,0.06)',
        'border-radius:8px', 'padding:10px 12px', 'margin-bottom:8px',
    ].join(';');

    row.innerHTML =
        /* 무기 이름 */
        '<input class="wp-name modal-inline-input" placeholder="Weapon Name" value="' + (name || '') + '"' +
        ' style="flex:2; min-width:0; margin-bottom:0;">' +
        /* 피해 */
        '<input class="wp-dmg modal-inline-input" placeholder="Dmg" value="' + (dmg || '1d6') + '"' +
        ' style="flex:1; min-width:0; text-align:center; margin-bottom:0; color:#aaa;">' +
        /* 기능치 종류 선택 */
        '<select class="wp-type modal-inline-input" style="flex:1.4; min-width:0; margin-bottom:0;">' + selectOpts + '</select>' +
        /* 비고 */
        '<input class="wp-desc modal-inline-input" placeholder="Notes" value="' + (desc || '') + '"' +
        ' style="flex:2; min-width:0; margin-bottom:0;">' +
        /* 삭제 버튼 */
        '<button onclick="this.parentElement.remove()"' +
        ' style="background:transparent; border:1px solid #5a2222; color:#aa6666;' +
        ' border-radius:5px; padding:4px 8px; cursor:pointer; font-size:12px; flex-shrink:0;">✕</button>';

    container.appendChild(row);
};

/**
 * 무기/스탯 모달에서 '저장' 버튼을 누르면 호출됩니다.
 */
window.saveWeaponData = async function () {
    if (!currentUser) { alert('로그인이 필요합니다.'); return; }
    var charId = charOwners[currentUser.email];
    if (!charId) { alert('권한 없음'); return; }

    var btn = document.querySelector('#weapon-modal .wm-save-btn');
    if (btn) { btn.innerText = 'Saving...'; btn.disabled = true; }

    /* 입력창에서 값 읽기 (없으면 기본값 사용) */
    var getNum = function (id, fallback) {
        var el = document.getElementById(id);
        return (el && el.value !== '') ? (parseInt(el.value) || 0) : (fallback || 0);
    };

    /* 무기 목록 수집 */
    var weapons = [];
    document.querySelectorAll('.weapon-row').forEach(function (row) {
        var name = (row.querySelector('.wp-name') || {}).value || '';
        var dmg  = (row.querySelector('.wp-dmg')  || {}).value || '1d3';
        var type = (row.querySelector('.wp-type') || {}).value || 'brawl';
        var desc = (row.querySelector('.wp-desc') || {}).value || '';
        if (name.trim()) weapons.push({ name: name.trim(), dmg: dmg, type: type, desc: desc });
    });

    /* JSON으로 묶어서 DB에 저장 */
    var payload = JSON.stringify({
        maxHp:    getNum('edit-hp-stat',       10),
        maxMp:    getNum('edit-mp-stat',       10),
        brawl:    getNum('edit-brawl-stat',    25),
        sword:    getNum('edit-sword-stat',    25),
        bow:      getNum('edit-bow-stat',      25),
        throw:    getNum('edit-throw-stat',    20),
        magic:    getNum('edit-magic-stat',    15),
        dodge:    getNum('edit-dodge-stat',    30),
        drive:    getNum('edit-drive-stat',    20),
        bp:       getNum('edit-bp-stat',       100),
        firstaid: getNum('edit-firstaid-stat', 35),
        medic:    getNum('edit-medic-stat',    1),
        weapons:  weapons,
    });

    var result = await upsertProfileData({ weapon_data: payload });

    if (btn) { btn.innerText = 'Save Combat Stats'; btn.disabled = false; }

    if (result && result.error) {
        alert('저장 실패: ' + result.error.message);
    } else {
        await loadCharacterData();
        closeModal('weapon-modal');
    }
};


/* ─────────────────────────────────────────────────────────────────
   5. 인벤토리 편집 모달
   ─────────────────────────────────────────────────────────────────
   인벤토리 그리드 클릭 시 열립니다.
   20칸의 슬롯에 아이템을 추가/수정/삭제할 수 있습니다.
───────────────────────────────────────────────────────────────── */

/* 인벤토리 모달 내부 상태 변수 */
var _currentInvTab   = 'general';  /* 현재 탭: 'general'(소지품) or 'furniture'(보관함) */
var _invRawGeneral   = [];         /* 소지품 원본 배열 */
var _invRawFurniture = [];         /* 보관함 원본 배열 */

/**
 * 인벤토리 탭을 전환합니다. (소지품 ↔ 보관함)
 */
window.changeInvTab = function (tabName) {
    _currentInvTab = tabName;

    /* 탭 버튼 active 상태 변경 */
    var tabs = document.querySelectorAll('#inv-tabs .phase-btn');
    tabs.forEach(function (t) { t.classList.remove('active'); });
    var activeBtn = document.querySelector('#inv-tabs .phase-btn[onclick*="' + tabName + '"]');
    if (activeBtn) activeBtn.classList.add('active');

    /* 현재 탭에 해당하는 배열을 currentInvData에 로드 */
    var src = (tabName === 'furniture') ? _invRawFurniture : _invRawGeneral;
    currentInvData = _parseInvArray(src);

    currentSlotIndex = -1;
    renderInvModalGrid();
    document.getElementById('inv-slot-form').style.display = 'none';
};

/** 배열을 파싱하여 표준 인벤토리 배열(20칸)로 변환하는 내부 함수 */
function _parseInvArray(src) {
    var result = [];
    for (var i = 0; i < 20; i++) {
        var item = src[i];
        if (!item || (typeof item === 'string' && item.indexOf('[object') !== -1)) {
            result.push(null);
        } else if (typeof item === 'object' && item.name) {
            result.push(item);
        } else {
            result.push(null);
        }
    }
    return result;
}

/**
 * 인벤토리 편집 모달을 엽니다.
 * DB에서 inventory, furniture_inventory를 불러옵니다.
 */
window.openInvModal = async function (charId, phaseIndex) {
    currentEditingId    = charId;
    currentEditingPhase = phaseIndex;

    /* DB에서 인벤토리 데이터 조회 */
    var res = await supabaseClient
        .from('character_profiles')
        .select('inventory, furniture_inventory')
        .eq('char_id', charId)
        .eq('phase',   phaseIndex)
        .single();

    var profile = res.data || {};

    /* 소지품 배열 파싱 */
    var rawG = profile.inventory || [];
    if (typeof rawG === 'string') { try { rawG = JSON.parse(rawG); } catch(e) { rawG = []; } }
    if (!Array.isArray(rawG)) rawG = [];
    _invRawGeneral = rawG;

    /* 보관함 배열 파싱 */
    var rawF = profile.furniture_inventory || [];
    if (typeof rawF === 'string') { try { rawF = JSON.parse(rawF); } catch(e) { rawF = []; } }
    if (!Array.isArray(rawF)) rawF = [];
    _invRawFurniture = rawF;

    /* 첫 탭 = 소지품으로 초기화 */
    _currentInvTab = 'general';
    var tabs = document.querySelectorAll('#inv-tabs .phase-btn');
    tabs.forEach(function (t, idx) { t.classList.toggle('active', idx === 0); });

    currentInvData   = _parseInvArray(rawG);
    currentSlotIndex = -1;

    document.getElementById('inv-slot-form').style.display = 'none';
    renderInvModalGrid();
    document.getElementById('inv-modal').classList.add('show');
};

/**
 * 인벤토리 모달의 20칸 그리드를 렌더링합니다.
 */
function renderInvModalGrid() {
    var grid = document.getElementById('inv-modal-grid');
    if (!grid) return;
    grid.innerHTML = '';

    var PH = (typeof PLACEHOLDER_ITEM !== 'undefined') ? PLACEHOLDER_ITEM : 'https://placehold.co/80x80';

    for (var i = 0; i < 20; i++) {
        var isSelected = (i === currentSlotIndex);
        /* 선택된 슬롯은 흰색 테두리로 강조 */
        var borderStyle = isSelected
            ? 'border:2px solid #aaa; box-shadow:0 0 8px rgba(200,200,200,0.3);'
            : 'border:1px solid rgba(255,255,255,0.06);';

        var slotItem = currentInvData[i];
        var imgSrc   = PH;
        var name     = '';
        var count    = 1;

        if (slotItem && slotItem.name) {
            name   = slotItem.name;
            imgSrc = slotItem.img  || PH;
            count  = parseInt(slotItem.count, 10) || 1;
        }

        /* 수량 배지 (2개 이상일 때만 표시) */
        var countBadge = (name && count > 1)
            ? '<div style="position:absolute; top:2px; right:2px; background:#555; color:#fff;' +
              'font-size:11px; font-weight:bold; padding:1px 4px; border-radius:3px; z-index:99;">×' + count + '</div>'
            : '';

        grid.innerHTML +=
            '<div class="inv-slot" style="cursor:pointer; width:70px!important; height:70px!important;' +
            'position:relative; overflow:hidden; background:#111; ' + borderStyle + '"' +
            ' onclick="selectInvSlot(' + i + ')">' +
            countBadge +
            '<img src="' + imgSrc + '" onerror="this.src=\'' + PH + '\'"' +
            ' style="width:100%; height:100%; object-fit:cover; position:absolute; top:0; left:0;">' +
            (name
                ? '<div style="position:absolute; bottom:0; left:0; width:100%;' +
                  'background:rgba(0,0,0,0.75); font-size:9px; color:#ccc;' +
                  'text-align:center; padding:2px 0;">' + name + '</div>'
                : '') +
            '</div>';
    }
}

/**
 * 슬롯을 선택하면 편집 폼을 표시합니다.
 */
window.selectInvSlot = function (index) {
    currentSlotIndex = index;
    renderInvModalGrid();
    document.getElementById('inv-slot-form').style.display = 'block';
    document.getElementById('inv-slot-title').innerText    = 'Slot ' + (index + 1);

    var nameInput = document.getElementById('inv-slot-name');
    var descInput = document.getElementById('inv-slot-desc');
    var giftBtn   = document.getElementById('inv-gift-btn');
    var useBtn    = document.getElementById('inv-use-btn');
    document.getElementById('inv-slot-file').value = '';

    var item = currentInvData[index];
    if (item && item.name) {
        nameInput.value = item.name || '';
        descInput.value = item.desc || '';
        if (giftBtn) giftBtn.style.display = 'inline-block';
        if (useBtn)  useBtn.style.display  = 'inline-block';
    } else {
        nameInput.value = '';
        descInput.value = '';
        if (giftBtn) giftBtn.style.display = 'none';
        if (useBtn)  useBtn.style.display  = 'none';
    }
};

/**
 * 슬롯 편집 폼에서 '적용' 버튼을 누르면 호출됩니다.
 * 이미지가 있으면 imgbb에 업로드하고 슬롯을 업데이트합니다.
 */
window.applyInvSlot = async function () {
    var nameInput  = document.getElementById('inv-slot-name').value.trim();
    var descInput  = document.getElementById('inv-slot-desc').value.trim();
    var fileInput  = document.getElementById('inv-slot-file');
    var applyBtn   = document.getElementById('inv-apply-btn');
    var PH         = (typeof PLACEHOLDER_ITEM !== 'undefined') ? PLACEHOLDER_ITEM : 'https://placehold.co/80x80';

    /* 기존 이미지 유지 (새 파일이 없으면) */
    var imgUrl = PH;
    var currentItem = currentInvData[currentSlotIndex];
    if (fileInput.files.length === 0 && currentItem && currentItem.img) {
        imgUrl = currentItem.img;
    }

    /* 새 이미지 파일이 있으면 imgbb에 업로드 */
    if (fileInput.files.length > 0) {
        applyBtn.innerText = 'Uploading...';
        applyBtn.disabled  = true;
        var uploadedUrl    = await uploadToImgbb(fileInput.files[0]);
        if (uploadedUrl) imgUrl = uploadedUrl;
        applyBtn.innerText = 'Apply';
        applyBtn.disabled  = false;
    }

    /* 슬롯 데이터 업데이트 */
    currentInvData[currentSlotIndex] = {
        name:  nameInput || 'Item',
        desc:  descInput,
        img:   imgUrl,
        count: (currentItem && currentItem.count) ? parseInt(currentItem.count, 10) : 1,
        type:  (_currentInvTab === 'furniture') ? 'furniture' : 'general',
    };

    renderInvModalGrid();
};

/**
 * 선택된 슬롯을 비웁니다.
 */
window.deleteInvSlot = function () {
    if (confirm('이 슬롯을 비우시겠습니까?')) {
        currentInvData[currentSlotIndex] = null;
        renderInvModalGrid();
        document.getElementById('inv-slot-name').value = '';
        document.getElementById('inv-slot-desc').value = '';
        var giftBtn = document.getElementById('inv-gift-btn');
        var useBtn  = document.getElementById('inv-use-btn');
        if (giftBtn) giftBtn.style.display = 'none';
        if (useBtn)  useBtn.style.display  = 'none';
    }
};

/**
 * 아이템을 1개 소모합니다.
 */
window.useInvItemOne = async function () {
    if (currentSlotIndex < 0) return;
    var item = currentInvData[currentSlotIndex];
    if (!item || !item.name) return;
    if (!confirm('[' + item.name + '] 1개를 사용하시겠습니까?')) return;

    item.count = (parseInt(item.count, 10) || 1) - 1;
    if (item.count <= 0) {
        currentInvData[currentSlotIndex] = null;
        currentSlotIndex = -1;
        document.getElementById('inv-slot-form').style.display = 'none';
        alert('아이템을 모두 소모했습니다.');
    }
    renderInvModalGrid();
};

/**
 * 인벤토리를 DB에 저장합니다.
 */
window.saveInventoryToDB = async function () {
    var btn = document.getElementById('inv-save-btn');
    btn.innerText = 'Saving...';
    btn.disabled  = true;

    /* 현재 탭에 따라 저장할 컬럼 선택 */
    var colKey  = (_currentInvTab === 'furniture') ? 'furniture_inventory' : 'inventory';
    var payload = {};
    payload[colKey] = currentInvData;

    var result = await upsertProfileData(payload);
    btn.innerText = 'Save Inventory';
    btn.disabled  = false;

    if (result && result.error) {
        alert('저장 실패');
    } else {
        await loadCharacterData();
        closeModal('inv-modal');
    }
};


/* ─────────────────────────────────────────────────────────────────
   6. 우편함 (캐릭터 간 아이템 선물 주고받기)
───────────────────────────────────────────────────────────────── */

/** 선물 모달을 엽니다. */
window.openGiftModal = function () {
    document.getElementById('gift-modal').classList.add('show');
};

/**
 * 아이템을 다른 캐릭터에게 선물합니다.
 * index.html의 gift-modal에서 대상 캐릭터를 선택 후 호출합니다.
 */
window.sendGift = async function () {
    var targetCharId = document.getElementById('gift-target').value;
    var sendBtn      = document.getElementById('send-gift-btn');

    if (targetCharId === currentEditingId) {
        alert('자신에게는 선물을 보낼 수 없습니다.');
        return;
    }

    var itemToGift = currentInvData[currentSlotIndex];
    if (!itemToGift) {
        alert('선물할 아이템이 없습니다.');
        return;
    }

    sendBtn.innerText = 'Sending...';
    sendBtn.disabled  = true;

    try {
        /* 대상 캐릭터의 우편함 조회 */
        var fetchRes = await supabaseClient
            .from('character_profiles')
            .select('mailbox')
            .eq('char_id', targetCharId)
            .eq('phase',   currentEditingPhase);

        var mailbox = [];
        if (fetchRes.data && fetchRes.data[0] && fetchRes.data[0].mailbox) {
            try { mailbox = JSON.parse(fetchRes.data[0].mailbox); } catch (e) { mailbox = []; }
        }
        if (!Array.isArray(mailbox)) mailbox = [];

        /* 아이템을 우편함에 추가 */
        mailbox.push(itemToGift);

        /* 대상 캐릭터 우편함 업데이트 */
        if (fetchRes.data && fetchRes.data.length > 0) {
            await supabaseClient
                .from('character_profiles')
                .update({ mailbox: mailbox })
                .eq('char_id', targetCharId)
                .eq('phase',   currentEditingPhase);
        } else {
            await supabaseClient
                .from('character_profiles')
                .insert([{ char_id: targetCharId, phase: currentEditingPhase, mailbox: mailbox }]);
        }

        /* 본인 인벤토리에서 아이템 제거 */
        currentInvData[currentSlotIndex] = null;
        await upsertProfileData({ inventory: currentInvData });

        alert('선물을 보냈습니다!');
        await loadCharacterData();
        closeModal('gift-modal');
        closeModal('inv-modal');
    } catch (err) {
        console.error('선물 전송 오류:', err);
        alert('전송 실패');
    }

    sendBtn.innerText = 'Send';
    sendBtn.disabled  = false;
};

/**
 * 우편함 모달을 엽니다.
 * DB에서 mailbox 데이터를 불러옵니다.
 */
window.openMailboxModal = async function (charId, phaseIndex) {
    currentEditingId    = charId;
    currentEditingPhase = phaseIndex;
    document.getElementById('mailbox-modal').classList.add('show');
    document.getElementById('mailbox-list').innerHTML = '<p style="color:#555; text-align:center;">Loading...</p>';

    var res = await supabaseClient
        .from('character_profiles')
        .select('mailbox')
        .eq('char_id', charId)
        .eq('phase',   phaseIndex);

    var parsedMailbox = [];
    if (res.data && res.data[0] && res.data[0].mailbox) {
        try { parsedMailbox = JSON.parse(res.data[0].mailbox); } catch (e) { parsedMailbox = []; }
    }
    currentMailboxData = Array.isArray(parsedMailbox) ? parsedMailbox : [];
    renderMailboxList();
};

/** 우편함 목록을 HTML로 렌더링합니다. */
function renderMailboxList() {
    var listContainer = document.getElementById('mailbox-list');
    if (!currentMailboxData || !currentMailboxData.length) {
        listContainer.innerHTML = '<p style="color:#555; text-align:center; padding:20px 0;">우편함이 비어있습니다.</p>';
        return;
    }

    var PH = (typeof PLACEHOLDER_ITEM !== 'undefined') ? PLACEHOLDER_ITEM : 'https://placehold.co/50x50';

    listContainer.innerHTML = currentMailboxData.map(function (item, index) {
        var name  = '?', desc = '', img = PH, count = 1;
        if (typeof item === 'object' && item.name) {
            name  = item.name; desc = item.desc || ''; img = item.img || PH;
            count = parseInt(item.count, 10) || 1;
        }
        var countBadge = count > 1
            ? '<span style="background:#555; color:#fff; padding:2px 4px; border-radius:4px; font-size:10px; margin-left:5px;">×' + count + '</span>'
            : '';

        return '<div style="display:flex; align-items:center; gap:10px; background:rgba(255,255,255,0.02);' +
            'padding:10px; border-radius:8px; border:1px solid #222; margin-bottom:10px;">' +
            '<img src="' + img + '" onerror="this.src=\'' + PH + '\'" style="width:42px; height:42px; object-fit:cover; border-radius:4px;">' +
            '<div style="flex-grow:1;">' +
                '<div style="color:#aaa; font-weight:bold;">' + name + countBadge + '</div>' +
                '<div style="color:#555; font-size:0.8rem;">' + desc + '</div>' +
            '</div>' +
            '<div style="display:flex; flex-direction:column; gap:5px;">' +
                '<button onclick="acceptMail(' + index + ', this)" style="background:#1a2a1a; color:#8a8; border:1px solid #4a6; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:0.82rem;">Accept</button>' +
                '<button onclick="deleteMail(' + index + ')"            style="background:#2a1a1a; color:#a66; border:1px solid #844; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:0.82rem;">Reject</button>' +
            '</div>' +
            '</div>';
    }).join('');
}

/** 우편을 수락하여 인벤토리에 넣습니다. */
window.acceptMail = async function (idx, btn) {
    var profile = (typeof allProfiles !== 'undefined')
        ? allProfiles.find(function (p) {
            return p.char_id === currentEditingId && p.phase === currentEditingPhase;
          })
        : null;

    /* 현재 인벤토리 로드 */
    var myInv = [];
    var rawInv = profile ? profile.inventory : [];
    if (typeof rawInv === 'string') { try { myInv = JSON.parse(rawInv); } catch (e) { myInv = []; } }
    else if (Array.isArray(rawInv))   myInv = rawInv.slice();
    while (myInv.length < 20) myInv.push(null);

    var incomingItem = currentMailboxData[idx];
    var placed = false;

    /* 같은 이름의 아이템이 있으면 수량 합산 */
    var itemName = typeof incomingItem === 'object' ? incomingItem.name : null;
    var incCount = typeof incomingItem === 'object' ? (parseInt(incomingItem.count) || 1) : 1;

    if (itemName) {
        for (var i = 0; i < 20; i++) {
            if (myInv[i] && myInv[i].name === itemName) {
                myInv[i].count = parseInt(myInv[i].count || 1) + incCount;
                placed = true;
                break;
            }
        }
    }

    /* 같은 이름 없으면 빈 슬롯에 넣기 */
    if (!placed) {
        var emptyIdx = -1;
        for (var j = 0; j < 20; j++) {
            if (myInv[j] === null || myInv[j] === '') { emptyIdx = j; break; }
        }
        if (emptyIdx === -1) { alert('인벤토리가 꽉 찼습니다!'); return; }
        myInv[emptyIdx] = incomingItem;
    }

    currentMailboxData.splice(idx, 1);
    btn.innerText = 'Accepting...';
    btn.disabled  = true;

    try {
        await upsertProfileData({ inventory: myInv, mailbox: currentMailboxData });
        alert('선물을 받았습니다!');
        await loadCharacterData();
        openMailboxModal(currentEditingId, currentEditingPhase);
    } catch (e) {
        console.error(e);
        alert('수락 중 오류가 발생했습니다.');
        btn.innerText = 'Accept';
        btn.disabled  = false;
    }
};

/** 우편을 거절(삭제)합니다. */
window.deleteMail = async function (idx) {
    if (confirm('이 우편을 거절하시겠습니까?')) {
        currentMailboxData.splice(idx, 1);
        await upsertProfileData({ mailbox: currentMailboxData });
        renderMailboxList();
    }
};


/* ─────────────────────────────────────────────────────────────────
   7. 소지금 관리 모달
   ─────────────────────────────────────────────────────────────────
   관리자가 소지금 행을 클릭하면 열립니다.
───────────────────────────────────────────────────────────────── */

/**
 * 소지금 관리 모달을 엽니다.
 * 현재 소지금을 DB에서 읽어서 표시합니다.
 */
window.openMoneyModal = function (charId, phaseIndex) {
    currentEditingId    = charId;
    currentEditingPhase = phaseIndex;

    /* allProfiles에서 현재 소지금 찾기 */
    var profile = (typeof allProfiles !== 'undefined')
        ? allProfiles.find(function (p) {
            return p.char_id === charId && p.phase === phaseIndex;
          })
        : null;

    currentMoney = (profile && profile.money)
        ? parseInt(String(profile.money).replace(/,/g, ''), 10) || 0
        : 0;

    document.getElementById('current-money-display').innerText = currentMoney.toLocaleString() + ' G';
    document.getElementById('money-amount').value = '';
    document.getElementById('money-modal').classList.add('show');
};

/**
 * 소지금을 증가 또는 감소시킵니다.
 *
 * 매개변수:
 *   type : 'add' (증가) or 'sub' (감소)
 */
window.processMoney = async function (type) {
    var amtInput = document.getElementById('money-amount');
    var amount   = parseInt(amtInput.value.replace(/,/g, ''), 10);

    if (!amount || amount <= 0) {
        alert('금액을 정확히 입력해주세요.');
        return;
    }
    if (!currentUser) {
        alert('로그인이 필요합니다.');
        return;
    }

    /* 관리자 본인 캐릭터 확인 */
    var myCharId = charOwners[currentUser.email];
    if (currentEditingId !== myCharId && !adminEmails.includes(currentUser.email)) {
        alert('본인 캐릭터의 소지금만 수정할 수 있습니다.');
        return;
    }

    try {
        /* 최신 소지금 재조회 (동시 편집 충돌 방지) */
        var res = await supabaseClient
            .from('character_profiles')
            .select('money')
            .eq('char_id', currentEditingId)
            .eq('phase',   currentEditingPhase)
            .single();

        var curMoney = 0;
        if (res.data && res.data.money) {
            curMoney = parseInt(String(res.data.money).replace(/,/g, ''), 10) || 0;
        }

        var newMoney = (type === 'add') ? curMoney + amount : curMoney - amount;
        if (newMoney < 0) {
            alert('소지금이 부족합니다.');
            return;
        }

        var upd = await upsertProfileData({ money: newMoney });
        if (upd && upd.error) {
            alert('업데이트 실패: ' + upd.error.message);
        } else {
            alert(amount.toLocaleString() + ' G ' + (type === 'add' ? '지급' : '차감') + ' 완료');
            currentMoney = newMoney;
            document.getElementById('current-money-display').innerText = newMoney.toLocaleString() + ' G';
            amtInput.value = '';
            if (typeof loadCharacterData === 'function') loadCharacterData();
            closeModal('money-modal');
        }
    } catch (e) {
        console.error('소지금 처리 오류:', e);
        alert('오류가 발생했습니다.');
    }
};
