/* ================================================================= */
/* Character.js — 캐릭터 페이지 빌드 및 통합 관리 스크립트          */
/* */
/* 주요 기능:                                                       */
/* 1. 캐릭터 데이터 파싱 및 페이지 HTML 동적 생성                   */
/* 2. 기본 프로필, 능력치, 전투/무기, 인벤토리 등 편집 모달 관리    */
/* 3. HP/MP 자동 계산 및 소지금(재화) 연산 오류 방지                */
/* 4. 캐릭터 간 아이템 선물(우편함) 기능 처리                       */
/* 5. BGM 연동 및 페이즈(Chapter) 전환 시 오디오 제어               */
/* ================================================================= */

// ─────────────────────────────────────────────────────────────────
// 1. 캐릭터 페이지 HTML 자동 생성 (그리드 레이아웃 및 흑백 스타일 적용)
// ─────────────────────────────────────────────────────────────────
function initCharacterPages() {
    var html = '<style>.stats-wrapper > *:not(.weapon-section):not(.inventory-section) { grid-column: 1; grid-row: 1; justify-self: center; align-self: center; margin-top:10px; }</style>';
    
    charData.forEach(function (c) {
        var slides = '';
        for (var i = 0; i < 4; i++) {
            slides +=
                '<div class="phase-slide ' + (i === 0 ? 'active' : '') + '">' +
                    '<div class="char-header-row">' +
                        '<h2>' + c.title + ' · ' + c.name + '</h2>' +
                        '<a href="#" class="link-btn">Character Sheet</a>' +
                    '</div>' +
                    '<div class="profile-overview">' +
                        '<img src="' + c.img + '" class="main-profile-img" onclick="openLightbox(this.src)">' +
                        '<div class="profile-info-wrapper">' +
                            '<div class="char-quote">' +
                                '<span class="quote-mark" style="color:#aaaaaa;">"</span>' +
                                '<p class="quote-text">' + c.quote + '</p>' +
                            '</div>' +
                            '<div class="divider-dots">• • •</div>' +
                            '<div class="info-table">' +
                                '<div class="info-row"><span class="info-label">Name</span><span class="info-value">' + c.name + '</span></div>' +
                                '<div class="info-row"><span class="info-label">Job</span><span class="info-value">Data ABC</span></div>' +
                                '<div class="info-row"><span class="info-label">Age</span><span class="info-value">Data 123</span></div>' +
                                '<div class="info-row"><span class="info-label">Location</span><span class="info-value">Data XYZ</span></div>' +
                                '<div class="info-row money-row"><span class="info-label">Balance</span><span class="info-value money-display">0 G</span></div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="divider-dots">• • •</div>' +
                    '<div class="stats-wrapper" data-stats="' + c.stats + '" data-color="170,170,170" style="display:grid; grid-template-columns: 1fr 1fr; grid-template-rows: auto auto; gap:10px 40px; align-items:start; justify-items:center;">' +
                        '<div class="weapon-section" style="grid-column: 2; grid-row: 1; width:100%; justify-self:stretch;">' +
                            '<div class="weapon-display-wrapper" data-weapon="{}">' +
                                '<div class="inv-header-wrapper" style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">' +
                                    '<h3 style="margin:0; font-family:\'Nanum Myeongjo\', serif; color:#cccccc;">Weapon &amp; Combat</h3>' +
                                    '<span class="wpn-brawl-display" style="background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.3); padding:4px 12px; border-radius:20px; font-size:0.85rem; color:#cccccc; font-weight:bold;">Brawl: 50</span>' +
                                '</div>' +
                                '<div class="weapon-content-list" style="display:flex;flex-direction:column;gap:8px;cursor:pointer;">' +
                                    '<div style="background:rgba(0,0,0,0.3);padding:15px;border-radius:12px;border:1px dashed rgba(255,255,255,0.3);text-align:center;color:#aaaaaa;font-size:0.9rem;">No weapons equipped.</div>' +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                        '<div class="inventory-section" style="grid-column: 1 / -1; grid-row: 2; width:100%; justify-self:stretch; margin-top:25px;">' +
                            '<div class="inv-header-inventory" style="margin-bottom:15px;">' +
                                '<div style="display:flex; align-items:center; justify-content:space-between; width:100%; gap:10px;">' +
                                    '<h3 style="margin:0; letter-spacing:1px; font-size:1.1rem; font-family:\'Nanum Myeongjo\', serif; color:#cccccc; white-space:nowrap;">Inventory</h3>' +
                                    '<div class="inv-tab-slot" style="display:flex; flex:1; max-width:180px; min-width:140px; background:rgba(20,20,20,0.8); border:1px solid rgba(255,255,255,0.3); border-radius:24px; padding:4px;"></div>' +
                                    '<button class="inv-mailbox-btn auth-btn" style="width:auto; margin:0; padding:6px 14px; font-size:0.75rem; border-radius:20px; white-space:nowrap; background:#333333; border:1px solid rgba(255,255,255,0.3); color:#cccccc; box-shadow:0 2px 4px rgba(0,0,0,0.3);" onclick="openMailboxModal(\'char-' + c.id + '\',' + i + ')">Mailbox</button>' +
                                '</div>' +
                            '</div>' +
                            '<div class="rpg-inventory"></div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="divider-dots">• • •</div>' +
                    '<h2>Backstory</h2>' +
                    '<p class="section-intro">Placeholder description text.</p>' +
                    '<details><summary>Event Log 1</summary><div class="details-content">Placeholder event details.</div></details>' +
                '</div>';
        }
        
        html +=
            '<section id="char-' + c.id + '" class="content-card">' +
                '<div class="phase-tabs">' +
                    '<button class="phase-btn active" onclick="changePhase(this, 0)">Chapter 1</button>' +
                    '<button class="phase-btn"        onclick="changePhase(this, 1)">Chapter 2</button>' +
                    '<button class="phase-btn"        onclick="changePhase(this, 2)">Chapter 3</button>' +
                    '<button class="phase-btn"        onclick="changePhase(this, 3)">Chapter 4</button>' +
                '</div>' +
                '<div class="phase-content-wrapper">' + slides + '</div>' +
            '</section>';
    });
    
    document.getElementById('character-pages-container').innerHTML = html;
    if (typeof drawAllRadarCharts === 'function') drawAllRadarCharts();
}

function initDefaultInventories() {
    document.querySelectorAll('.rpg-inventory').forEach(function (inv) {
        while (inv.querySelectorAll('.inv-slot').length < 20) {
            inv.insertAdjacentHTML('beforeend', '<div class="inv-slot"></div>');
        }
    });
}

// ─────────────────────────────────────────────────────────────────
// 2. 기본 정보 편집 모달 (BGM 불러오기 및 저장 연동)
// ─────────────────────────────────────────────────────────────────
window.openGeneralModal = function (charId, phaseIndex) {
    var myCharId = currentUser ? charOwners[currentUser.email] : null;
    if (myCharId !== charId) return alert('본인의 캐릭터 정보만 수정할 수 있습니다.');
    
    currentEditingId    = charId;
    currentEditingPhase = phaseIndex;

    var targetSlide = document.getElementById(charId).querySelectorAll('.phase-slide')[phaseIndex];
    var iv = targetSlide.querySelectorAll('.info-value');
    
    document.getElementById('edit-modal-title').innerText  = iv[0].innerText + ' - Edit Profile';
    document.getElementById('current-profile-img').value   = targetSlide.querySelector('.main-profile-img').src;
    document.getElementById('edit-quote').value            = targetSlide.querySelector('.quote-text').innerText;
    document.getElementById('edit-job').value              = iv[1].innerText.replace(/Data ABC/g, '');
    document.getElementById('edit-age').value              = iv[2].innerText.replace(/Data 123/g, '');
    document.getElementById('edit-residence').value        = iv[3].innerText.replace(/Data XYZ/g, '');
    document.getElementById('edit-backstory').value        = targetSlide.querySelector('.section-intro').innerText;
    
    var currentRgb = targetSlide.querySelector('.stats-wrapper').getAttribute('data-color') || '170, 170, 170';
    document.getElementById('edit-theme-color').value = rgbToHex(currentRgb);

    var profile = (typeof allProfiles !== 'undefined')
        ? allProfiles.find(function (p) { return p.char_id === charId && p.phase === phaseIndex; })
        : null;
    if (document.getElementById('edit-bgm-url')) {
        document.getElementById('edit-bgm-url').value = (profile && profile.bgm_url) ? profile.bgm_url : '';
    }

    document.getElementById('edit-modal').classList.add('show');
};

window.saveGeneralData = async function () {
    var btn = document.getElementById('save-btn');
    btn.innerText = 'Saving...'; 
    btn.disabled = true;

    var finalImg  = document.getElementById('current-profile-img').value;
    var fileInput = document.getElementById('edit-profile-file');
    
    if (fileInput.files.length > 0) {
        btn.innerText = 'Uploading...';
        var uploadedUrl = await uploadToImgbb(fileInput.files[0]);
        if (uploadedUrl) finalImg = uploadedUrl;
        else alert('이미지 업로드에 실패했습니다.');
    }
    
    var hexColor = document.getElementById('edit-theme-color').value;
    var bgmUrl   = document.getElementById('edit-bgm-url') ? document.getElementById('edit-bgm-url').value.trim() : '';

    var res = await upsertProfileData({
        profile_image: finalImg,
        quote:         document.getElementById('edit-quote').value,
        job:           document.getElementById('edit-job').value,
        age:           document.getElementById('edit-age').value,
        residence:     document.getElementById('edit-residence').value,
        backstory:     document.getElementById('edit-backstory').value,
        chart_color:   hexToRgb(hexColor),
        bgm_url:       bgmUrl
    });
    
    btn.innerText = 'Save Changes'; 
    btn.disabled = false;
    
    if (res && res.error) alert('저장 실패');
    else { await loadCharacterData(); closeModal('edit-modal'); }
};

// ─────────────────────────────────────────────────────────────────
// 3. 능력치 편집 모달
// ─────────────────────────────────────────────────────────────────
window.openStatsModal = function (charId, phaseIndex) {
    currentEditingId    = charId;
    currentEditingPhase = phaseIndex;
    
    var statsStr = document.getElementById(charId)
        .querySelectorAll('.phase-slide')[phaseIndex]
        .querySelector('.stats-wrapper').getAttribute('data-stats') || '50,50,50,50,50,50,50,50';
    var stats = statsStr.split(',').map(Number);

    var h = '';
    for (var i = 0; i < 8; i++) {
        h += '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<span style="color:#cccccc;font-weight:bold;">' + STAT_LABELS[i] + '</span>' +
            '<input type="number" id="stat-input-' + i + '" value="' + (stats[i] || 50) + '" class="modal-inline-input" style="width:60px;text-align:center;">' +
            '</div>';
    }
    document.getElementById('stats-inputs-container').innerHTML = h;
    document.getElementById('stats-modal').classList.add('show');
};

window.saveStatsToDB = async function () {
    var btn = document.getElementById('stats-save-btn');
    btn.innerText = 'Applying...'; 
    btn.disabled = true;
    
    var arr = [];
    for (var i = 0; i < 8; i++) arr.push(document.getElementById('stat-input-' + i).value || 50);
    
    var res = await upsertProfileData({ stats: arr.join(',') });
    btn.innerText = 'Apply Stats'; 
    btn.disabled = false;
    
    if (res && res.error) alert('저장 실패');
    else { await loadCharacterData(); closeModal('stats-modal'); }
    if (typeof window.drawAllRadarCharts === 'function') window.drawAllRadarCharts();
};

// ─────────────────────────────────────────────────────────────────
// 4. 무기 및 전투 스탯 관리 (HP/MP 자동 계산 포함)
// ─────────────────────────────────────────────────────────────────
function calcHpMpFromStats(statsStr) {
    var sArr = (statsStr || '').split(',').map(Number);
    var con  = sArr[1] || 0;
    var siz  = sArr[2] || 0;
    var pow  = sArr[6] || 0;

    var hp = (con + siz > 0) ? Math.round((con + siz) / 10) : null;
    var mp = pow > 0         ? Math.round(pow / 5)         : null;

    var hpEl = document.getElementById('calc-hp-display');
    var mpEl = document.getElementById('calc-mp-display');
    if (hpEl) hpEl.textContent = hp !== null ? hp : '—';
    if (mpEl) mpEl.textContent = mp !== null ? mp : '—';

    if (!document.getElementById('_raid-hp-cache')) {
        var hid1 = document.createElement('input');
        hid1.type = 'hidden'; hid1.id = '_raid-hp-cache';
        document.body.appendChild(hid1);
    }
    if (!document.getElementById('_raid-mp-cache')) {
        var hid2 = document.createElement('input');
        hid2.type = 'hidden'; hid2.id = '_raid-mp-cache';
        document.body.appendChild(hid2);
    }
    document.getElementById('_raid-hp-cache').value = hp !== null ? hp : '';
    document.getElementById('_raid-mp-cache').value = mp !== null ? mp : '';
}

window.openWeaponModal = async function(charId, phaseIndex) {
    if (!currentUser) return alert('로그인이 필요합니다.');
    var myCharId = charOwners[currentUser.email];
    if (myCharId !== charId) return alert('본인 캐릭터만 수정할 수 있습니다.');
    
    currentEditingId    = charId;
    currentEditingPhase = phaseIndex;

    var res = await supabaseClient
        .from('character_profiles').select('weapon_data, stats')
        .eq('char_id', charId).eq('phase', phaseIndex).single();

    var inputIds = [
        'edit-hp-stat', 'edit-mp-stat',
        'edit-brawl-stat', 'edit-sword-stat', 'edit-bow-stat',  'edit-throw-stat',
        'edit-magic-stat', 'edit-dodge-stat', 'edit-drive-stat','edit-bp-stat',
        'edit-firstaid-stat', 'edit-medic-stat'
    ];
    inputIds.forEach(function(id) {
        var el = document.getElementById(id); 
        if (el) el.value = '';
    });
    document.getElementById('weapon-list-container').innerHTML = '';

    var statsStr = (res.data && res.data.stats) ? res.data.stats : null;
    if (!statsStr) {
        var base = charData.find(function(c) { return 'char-' + c.id === charId; });
        statsStr = base ? base.stats : '';
    }
    var sArr = (statsStr || '').split(',').map(Number);
    var defHp = (sArr[1] + sArr[2] > 0) ? Math.round((sArr[1] + sArr[2]) / 10) : '';
    var defMp = (sArr[6] > 0) ? Math.round(sArr[6] / 5) : '';

    if (res.data && res.data.weapon_data) {
        try {
            var w = typeof res.data.weapon_data === 'string' ? JSON.parse(res.data.weapon_data) : res.data.weapon_data;
            var setVal = function(id, val) {
                var el = document.getElementById(id);
                if (el && val !== undefined && val !== null) el.value = val;
            };

            setVal('edit-hp-stat', w.maxHp != null ? w.maxHp : defHp);
            setVal('edit-mp-stat', w.maxMp != null ? w.maxMp : defMp);
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

            (w.weapons || []).forEach(function(wp) {
                window.addWeaponRow(wp.name, wp.dmg, wp.type || 'brawl', wp.desc || '');
            });
        } catch (e) {
            console.warn('weapon_data 파싱 오류', e);
        }
    } else {
        document.getElementById('edit-hp-stat').value = defHp;
        document.getElementById('edit-mp-stat').value = defMp;
    }

    document.getElementById('weapon-modal').classList.add('show');
};

window.addWeaponRow = function(name, dmg, type, desc) {
    var container = document.getElementById('weapon-list-container');
    if (!container) return;

    var typeOptions = [
        { val: 'brawl', label: 'Melee: Brawl' },
        { val: 'sword', label: 'Melee: Sword' },
        { val: 'bow',   label: 'Ranged: Bow'  },
        { val: 'throw', label: 'Throw'        },
        { val: 'magic', label: 'Magic'        }
    ];

    var selectOpts = typeOptions.map(function(o) {
        var selected = (o.val === (type || 'brawl')) ? ' selected' : '';
        return '<option value="' + o.val + '"' + selected + '>' + o.label + '</option>';
    }).join('');

    var row = document.createElement('div');
    row.className = 'weapon-row';
    row.style.cssText = [
        'display:flex', 'gap:6px', 'align-items:center',
        'background:rgba(255,255,255,0.05)', 'border:1px solid rgba(255,255,255,0.1)',
        'border-radius:8px', 'padding:8px 10px', 'margin-bottom:6px'
    ].join(';');

    row.innerHTML =
        '<input class="wp-name modal-inline-input" placeholder="Name" value="' + (name || '') + '" style="flex:2;min-width:0;">' +
        '<input class="wp-dmg modal-inline-input" placeholder="Damage" value="' + (dmg || '1d6') + '" style="flex:1;min-width:0;text-align:center;">' +
        '<select class="wp-type modal-inline-input" style="flex:1.4;min-width:0;">' + selectOpts + '</select>' +
        '<input class="wp-desc modal-inline-input" placeholder="Notes" value="' + (desc || '') + '" style="flex:2;min-width:0;">' +
        '<button onclick="this.parentElement.remove()" style="background:transparent;border:1px solid #555555;color:#aaaaaa;border-radius:5px;padding:4px 8px;cursor:pointer;font-size:12px;flex-shrink:0;">✕</button>';

    container.appendChild(row);
};

window.saveWeaponData = async function() {
    if (!currentUser) return alert('로그인이 필요합니다.');
    var charId = charOwners[currentUser.email];
    if (!charId) return alert('권한 없음');

    var btn = document.querySelector('#weapon-modal .wm-save-btn');
    if (btn) { btn.innerText = 'Saving...'; btn.disabled = true; }

    var getNum = function(id, fallback) {
        var el = document.getElementById(id);
        return (el && el.value !== '') ? (parseInt(el.value) || 0) : (fallback || 0);
    };

    var maxHp    = getNum('edit-hp-stat',       10);
    var maxMp    = getNum('edit-mp-stat',       10);
    var brawl    = getNum('edit-brawl-stat',    25);
    var sword    = getNum('edit-sword-stat',    25);
    var bow      = getNum('edit-bow-stat',      25);
    var throw_   = getNum('edit-throw-stat',    20);
    var magic    = getNum('edit-magic-stat',    15);
    var dodge    = getNum('edit-dodge-stat',    0);
    var drive    = getNum('edit-drive-stat',    20);
    var bp       = getNum('edit-bp-stat',       100);
    var firstaid = getNum('edit-firstaid-stat', 35);
    var medic    = getNum('edit-medic-stat',    1);

    var weapons = [];
    document.querySelectorAll('.weapon-row').forEach(function(row) {
        var name = (row.querySelector('.wp-name') || {}).value || '';
        var dmg  = (row.querySelector('.wp-dmg')  || {}).value || '1d3';
        var type = (row.querySelector('.wp-type') || {}).value || 'brawl';
        var desc = (row.querySelector('.wp-desc') || {}).value || '';
        if (name.trim()) weapons.push({ name: name.trim(), dmg: dmg, type: type, desc: desc });
    });

    var payload = JSON.stringify({
        brawl: brawl, sword: sword, bow: bow, throw: throw_, magic: magic,
        dodge: dodge, drive: drive, bp: bp, firstaid: firstaid, medic: medic,
        maxHp: maxHp, maxMp: maxMp, weapons: weapons
    });

    var res = await upsertProfileData({ weapon_data: payload });

    if (btn) { btn.innerText = 'Save Combat Stats'; btn.disabled = false; }
    if (res && res.error) alert('저장 실패: ' + res.error.message);
    else { await loadCharacterData(); closeModal('weapon-modal'); }
};

// ─────────────────────────────────────────────────────────────────
// 5. 인벤토리 관리 (모달 및 툴팁 로직)
// ─────────────────────────────────────────────────────────────────
var _currentInvTab      = 'general';  
var _invRawGeneral      = [];         
var _invRawFurniture    = [];         

window.changeInvTab = function (tabName) {
    _currentInvTab = tabName;
    var tabs = document.querySelectorAll('#inv-tabs .phase-btn');
    tabs.forEach(function (t) { t.classList.remove('active'); });
    var activeBtn = document.querySelector('#inv-tabs .phase-btn[onclick="changeInvTab(\'' + tabName + '\')"]');
    if (activeBtn) activeBtn.classList.add('active');

    var src = (tabName === 'furniture') ? _invRawFurniture : _invRawGeneral;
    currentInvData = [];
    for (var i = 0; i < 20; i++) {
        var item = src[i];
        if (!item || (typeof item === 'string' && item.indexOf('[object') !== -1)) {
            currentInvData.push(null);
        } else if (typeof item === 'object' && item.name) {
            currentInvData.push(item);
        } else if (typeof item === 'string' && item.indexOf(':') !== -1) {
            var p = item.split(':');
            currentInvData.push({ name: p[0], desc: p[1] || '', img: p.slice(2).join(':'), count: 1 });
        } else {
            currentInvData.push(null);
        }
    }

    currentSlotIndex = -1;
    renderInvModalGrid();
    document.getElementById('inv-slot-form').style.display = 'none';
};

window.openInvModal = async function (charId, phaseIndex) {
    currentEditingId    = charId;
    currentEditingPhase = phaseIndex;

    var res = await supabaseClient
        .from('character_profiles')
        .select('inventory, furniture_inventory')
        .eq('char_id', charId).eq('phase', phaseIndex).single();

    var profile = res.data || null;

    var rawG = (profile && profile.inventory) ? profile.inventory : [];
    if (typeof rawG === 'string') { try { rawG = JSON.parse(rawG); } catch(e) { rawG = []; } }
    if (!Array.isArray(rawG)) rawG = [];
    _invRawGeneral = rawG;

    var rawF = (profile && profile.furniture_inventory) ? profile.furniture_inventory : [];
    if (typeof rawF === 'string') { try { rawF = JSON.parse(rawF); } catch(e) { rawF = []; } }
    if (!Array.isArray(rawF)) rawF = [];
    _invRawFurniture = rawF;

    _currentInvTab = 'general';
    var tabs = document.querySelectorAll('#inv-tabs .phase-btn');
    tabs.forEach(function (t, idx) { t.classList.toggle('active', idx === 0); });

    currentInvData = [];
    for (var i = 0; i < 20; i++) {
        var item = rawG[i];
        if (!item || (typeof item === 'string' && item.indexOf('[object') !== -1)) {
            currentInvData.push(null);
        } else if (typeof item === 'object' && item.name) {
            currentInvData.push(item);
        } else if (typeof item === 'string' && item.indexOf(':') !== -1) {
            var p = item.split(':');
            currentInvData.push({ name: p[0], desc: p[1] || '', img: p.slice(2).join(':'), count: 1 });
        } else {
            currentInvData.push(null);
        }
    }

    currentSlotIndex = -1;
    document.getElementById('inv-slot-form').style.display = 'none';
    renderInvModalGrid();
    document.getElementById('inv-modal').classList.add('show');
};

function renderInvModalGrid() {
    var grid = document.getElementById('inv-modal-grid');
    if (!grid) return;
    grid.innerHTML = '';

    var PH = (typeof PLACEHOLDER_ITEM !== 'undefined') ? PLACEHOLDER_ITEM : 'https://placehold.co/100?text=Empty';

    for (var i = 0; i < 20; i++) {
        var isSelected = (i === currentSlotIndex);
        var hl = isSelected
            ? 'border:2px solid #ffffff;box-shadow:0 0 10px rgba(255,255,255,0.5);'
            : 'border:1px solid rgba(255,255,255,0.1);';

        var slotItem = currentInvData[i];
        var imgSrc   = PH;
        var name     = '';
        var desc     = '';
        var count    = 1;

        if (slotItem && slotItem.name) {
            name   = slotItem.name;
            desc   = slotItem.desc || '';
            imgSrc = slotItem.img  || PH;
            count  = parseInt(slotItem.count, 10) || 1;
        }

        var countBadge = (name && count > 1)
            ? '<div style="position:absolute;top:2px;right:2px;background:#555555;color:#ffffff;font-size:12px;font-weight:bold;padding:2px 5px;border-radius:4px;z-index:99;box-shadow:0 0 3px #000;">x' + count + '</div>'
            : '';

        grid.innerHTML +=
            '<div class="inv-slot" style="cursor:pointer;width:70px!important;height:70px!important;position:relative;overflow:hidden;background:#222;' + hl + '" onclick="selectInvSlot(' + i + ')" title="' + desc + '">' +
            countBadge +
            '<img src="' + imgSrc + '" onerror="this.src=\'https://placehold.co/100?text=Error\'" style="width:100%;height:100%;object-fit:cover;position:absolute;top:0;left:0;z-index:1;">' +
            (name ? '<div style="position:absolute;bottom:0;left:0;width:100%;background:rgba(0,0,0,0.8);font-size:10px;color:#ffffff;text-align:center;padding:3px 0;z-index:10;">' + name + '</div>' : '') +
            '</div>';
    }
}

window.selectInvSlot = function (index) {
    currentSlotIndex = index;
    renderInvModalGrid();
    document.getElementById('inv-slot-form').style.display = 'block';
    document.getElementById('inv-slot-title').innerText    = 'Slot ' + (index + 1);

    var nIn  = document.getElementById('inv-slot-name');
    var dIn  = document.getElementById('inv-slot-desc');
    var gBtn = document.getElementById('inv-gift-btn');
    var uBtn = document.getElementById('inv-use-btn');
    document.getElementById('inv-slot-file').value = '';

    var item = currentInvData[index];
    if (item && item.name) {
        nIn.value = item.name || '';
        dIn.value = item.desc || '';
        if (gBtn) gBtn.style.display = 'inline-block';
        if (uBtn) uBtn.style.display = 'inline-block';
    } else {
        nIn.value = ''; dIn.value = '';
        if (gBtn) gBtn.style.display = 'none';
        if (uBtn) uBtn.style.display = 'none';
    }
};

window.applyInvSlot = async function () {
    var nIn  = document.getElementById('inv-slot-name').value.trim();
    var dIn  = document.getElementById('inv-slot-desc').value.trim();
    var fIn  = document.getElementById('inv-slot-file');
    var btn  = document.getElementById('inv-apply-btn');
    var PH   = (typeof PLACEHOLDER_ITEM !== 'undefined') ? PLACEHOLDER_ITEM : 'https://placehold.co/100?text=Empty';
    var imgUrl = PH;

    var currentItem = currentInvData[currentSlotIndex];
    if (fIn.files.length === 0 && currentItem && currentItem.img) imgUrl = currentItem.img;

    if (fIn.files.length > 0) {
        btn.innerText = 'Uploading...'; btn.disabled = true;
        var uploadedUrl = await uploadToImgbb(fIn.files[0]);
        if (uploadedUrl) imgUrl = uploadedUrl;
        btn.innerText = 'Apply'; btn.disabled = false;
    }

    currentInvData[currentSlotIndex] = {
        name:  nIn || 'Item',
        desc:  dIn,
        img:   imgUrl,
        count: (currentItem && currentItem.count) ? parseInt(currentItem.count, 10) : 1,
        type:  (_currentInvTab === 'furniture') ? 'furniture' : 'general'
    };
    renderInvModalGrid();
};

window.deleteInvSlot = function () {
    if (confirm('이 슬롯을 비우시겠습니까?')) {
        currentInvData[currentSlotIndex] = null;
        renderInvModalGrid();
        document.getElementById('inv-slot-name').value = '';
        document.getElementById('inv-slot-desc').value = '';
        var gBtn = document.getElementById('inv-gift-btn');
        var uBtn = document.getElementById('inv-use-btn');
        if (gBtn) gBtn.style.display = 'none';
        if (uBtn) uBtn.style.display = 'none';
    }
};

window.useInvItemOne = async function () {
    if (currentSlotIndex < 0) return;
    var item = currentInvData[currentSlotIndex];
    if (!item || !item.name) return;
    if (!confirm('[' + item.name + '] 아이템을 1개 사용하시겠습니까?')) return;

    item.count = (parseInt(item.count, 10) || 1) - 1;
    if (item.count <= 0) {
        currentInvData[currentSlotIndex] = null;
        currentSlotIndex = -1;
        document.getElementById('inv-slot-form').style.display = 'none';
        alert('아이템을 모두 소모했습니다.');
    } else {
        alert('아이템 1개를 소모했습니다.');
    }
    renderInvModalGrid();
};

window.saveInventoryToDB = async function () {
    var btn = document.getElementById('inv-save-btn');
    btn.innerText = 'Saving...'; btn.disabled = true;

    var colKey = (_currentInvTab === 'furniture') ? 'furniture_inventory' : 'inventory';
    var payload = {};
    payload[colKey] = currentInvData;

    var res = await upsertProfileData(payload);
    btn.innerText = 'Save Inventory'; btn.disabled = false;
    if (res && res.error) alert('저장 실패');
    else { await loadCharacterData(); closeModal('inv-modal'); }
};

// ─────────────────────────────────────────────────────────────────
// 6. 우편함 처리 (선물 발송 및 수령)
// ─────────────────────────────────────────────────────────────────
window.openGiftModal = function () { document.getElementById('gift-modal').classList.add('show'); };

window.sendGift = async function () {
    var targetCharId = document.getElementById('gift-target').value;
    var btn = document.getElementById('send-gift-btn');
    if (targetCharId === currentEditingId) return alert('자신에게 보낼 수 없습니다.');

    var itemToGift = currentInvData[currentSlotIndex];
    if (!itemToGift) return alert('보낼 아이템이 없습니다.');

    btn.innerText = 'Sending...'; btn.disabled = true;
    try {
        var fetchRes = await supabaseClient.from('character_profiles').select('mailbox')
            .eq('char_id', targetCharId).eq('phase', currentEditingPhase);

        var mb = [];
        if (fetchRes.data && fetchRes.data[0] && fetchRes.data[0].mailbox) {
            try { mb = JSON.parse(fetchRes.data[0].mailbox); } catch (e) { mb = []; }
        }
        if (!Array.isArray(mb)) mb = [];
        mb.push(itemToGift);

        if (fetchRes.data && fetchRes.data.length > 0) {
            await supabaseClient.from('character_profiles').update({ mailbox: mb })
                .eq('char_id', targetCharId).eq('phase', currentEditingPhase);
        } else {
            await supabaseClient.from('character_profiles')
                .insert([{ char_id: targetCharId, phase: currentEditingPhase, mailbox: mb }]);
        }

        currentInvData[currentSlotIndex] = null;
        await upsertProfileData({ inventory: currentInvData });

        alert('우편이 발송되었습니다!');
        await loadCharacterData();
        closeModal('gift-modal');
        closeModal('inv-modal');
    } catch (err) {
        console.error(err);
        alert('발송 실패');
    }
    btn.innerText = 'Send Gift'; btn.disabled = false;
};

window.openMailboxModal = async function (charId, phaseIndex) {
    currentEditingId    = charId;
    currentEditingPhase = phaseIndex;
    document.getElementById('mailbox-modal').classList.add('show');
    document.getElementById('mailbox-list').innerHTML = '<p style="color:#cccccc;text-align:center;">Loading...</p>';

    var res = await supabaseClient.from('character_profiles').select('mailbox')
        .eq('char_id', charId).eq('phase', phaseIndex);

    var parsedMb = [];
    if (res.data && res.data[0] && res.data[0].mailbox) {
        try { parsedMb = JSON.parse(res.data[0].mailbox); } catch (e) { parsedMb = []; }
        if (typeof res.data[0].mailbox === 'string' &&
            res.data[0].mailbox.indexOf(':') !== -1 &&
            res.data[0].mailbox.indexOf('[') === -1) {
            parsedMb = res.data[0].mailbox.split(',').filter(Boolean);
        }
    }
    currentMailboxData = Array.isArray(parsedMb) ? parsedMb : [];
    renderMailboxList();
};

function renderMailboxList() {
    var listContainer = document.getElementById('mailbox-list');
    if (!currentMailboxData || !currentMailboxData.length) {
        listContainer.innerHTML = '<p style="color:#777777;text-align:center;padding:20px 0;">우편함이 비어있습니다.</p>';
        return;
    }
    var PH = (typeof PLACEHOLDER_ITEM !== 'undefined') ? PLACEHOLDER_ITEM : 'https://placehold.co/100?text=Empty';
    listContainer.innerHTML = currentMailboxData.map(function (item, index) {
        var name = '?', desc = '', img = PH, count = 1;
        if (typeof item === 'object' && item.name) {
            name = item.name; desc = item.desc || ''; img = item.img || PH; count = parseInt(item.count, 10) || 1;
        } else if (typeof item === 'string') {
            var p = item.split(':');
            name = p[0] || '?'; desc = p[1] || '';
            if (p.length > 2) img = p.slice(2).join(':');
        }
        var badge = count > 1
            ? '<span style="background:#555555;color:#ffffff;padding:2px 4px;border-radius:4px;font-size:10px;font-weight:bold;margin-left:5px;">x' + count + '</span>'
            : '';
        return '<div class="mail-item-card" style="display:flex;align-items:center;gap:10px;background:#222;padding:10px;border-radius:8px;border:1px solid #444;margin-bottom:10px;">' +
            '<img src="' + img + '" onerror="this.src=\'' + PH + '\'" class="mail-item-img" style="width:40px;height:40px;object-fit:cover;border-radius:4px;">' +
            '<div style="flex-grow:1;">' +
                '<div style="color:#cccccc;font-weight:bold;">' + name + badge + '</div>' +
                '<div style="color:#aaaaaa;font-size:0.8rem;">' + desc + '</div>' +
            '</div>' +
            '<div style="display:flex;flex-direction:column;gap:5px;">' +
                '<button onclick="acceptMail(' + index + ', this)" style="background:#444444;color:#ffffff;border:1px solid #666;padding:6px 12px;border-radius:4px;cursor:pointer;">Accept</button>' +
                '<button onclick="deleteMail(' + index + ')"       style="background:#333333;color:#ffffff;border:1px solid #555;padding:6px 12px;border-radius:4px;cursor:pointer;">Reject</button>' +
            '</div>' +
            '</div>';
    }).join('');
}

window.acceptMail = async function (idx, btn) {
    var profile = (typeof allProfiles !== 'undefined')
        ? allProfiles.find(function (p) { return p.char_id === currentEditingId && p.phase === currentEditingPhase; })
        : null;

    var rawInv = profile ? profile.inventory : [];
    var myInv  = [];
    if (typeof rawInv === 'string') {
        try { myInv = JSON.parse(rawInv); } catch (e) { myInv = []; }
    } else if (Array.isArray(rawInv)) {
        myInv = rawInv.slice();
    }
    while (myInv.length < 20) myInv.push(null);

    var incomingItem = currentMailboxData[idx];
    var itemName  = typeof incomingItem === 'object' ? incomingItem.name : (typeof incomingItem === 'string' ? incomingItem.split(':')[0] : null);
    var incCount  = typeof incomingItem === 'object' ? (parseInt(incomingItem.count, 10) || 1) : 1;
    var placed    = false;

    if (itemName) {
        for (var i = 0; i < 20; i++) {
            if (myInv[i] && myInv[i].name === itemName) {
                myInv[i].count = parseInt(myInv[i].count || 1, 10) + incCount;
                placed = true;
                break;
            }
        }
    }

    if (!placed) {
        var emptyIdx = -1;
        for (var j = 0; j < 20; j++) {
            if (myInv[j] === null || myInv[j] === '') { emptyIdx = j; break; }
        }
        if (emptyIdx === -1) return alert('가방이 꽉 찼습니다!');
        if (typeof incomingItem === 'string') {
            var p = incomingItem.split(':');
            incomingItem = { name: p[0], desc: p[1] || '', img: p.slice(2).join(':'), count: 1 };
        }
        myInv[emptyIdx] = incomingItem;
    }

    currentMailboxData.splice(idx, 1);
    btn.innerText = 'Accepting...'; btn.disabled = true;

    try {
        await upsertProfileData({ inventory: myInv, mailbox: currentMailboxData });
        alert('아이템을 수령했습니다.');
        await loadCharacterData();
        openMailboxModal(currentEditingId, currentEditingPhase);
    } catch (e) {
        console.error(e);
        alert('수령 중 오류가 발생했습니다.');
        btn.innerText = 'Accept'; btn.disabled = false;
    }
};

window.deleteMail = async function (idx) {
    if (confirm('이 우편을 파기하시겠습니까?')) {
        currentMailboxData.splice(idx, 1);
        await upsertProfileData({ mailbox: currentMailboxData });
        renderMailboxList();
    }
};

// ─────────────────────────────────────────────────────────────────
// 7. 소지금(재화) 연산 오류 해결
// ─────────────────────────────────────────────────────────────────
window.openMoneyModal = function (charId, phaseIndex) {
    currentEditingId    = charId;
    currentEditingPhase = phaseIndex;
    var profile = (typeof allProfiles !== 'undefined')
        ? allProfiles.find(function (p) { return p.char_id === charId && p.phase === phaseIndex; })
        : null;
    currentMoney = (profile && profile.money) ? parseInt(String(profile.money).replace(/,/g, ''), 10) || 0 : 0;
    document.getElementById('current-money-display').innerText = currentMoney.toLocaleString() + ' G';
    document.getElementById('money-amount').value = '';
    document.getElementById('money-modal').classList.add('show');
};

window.processMoney = async function (type) {
    var amtInput = document.getElementById('money-amount');
    var amount = parseInt(amtInput.value.replace(/,/g, ''), 10);
    if (!amount || amount <= 0) return alert('금액을 정확히 입력해주세요.');
    if (!currentUser) return alert('로그인이 필요합니다.');

    var myCharId = charOwners[currentUser.email];
    if (currentEditingId !== myCharId) {
        return alert('본인 캐릭터의 소지금만 수정할 수 있습니다.');
    }

    try {
        var res = await supabaseClient
            .from('character_profiles').select('money')
            .eq('char_id', currentEditingId)
            .eq('phase', currentEditingPhase) 
            .single();

        var curMoney = 0;
        if (res.data && res.data.money) {
            curMoney = parseInt(String(res.data.money).replace(/,/g, ''), 10) || 0;
        }

        var newMoney = (type === 'add') ? curMoney + amount : curMoney - amount;
        if (newMoney < 0) return alert('소지금이 부족하여 차감할 수 없습니다.');

        var upd = await upsertProfileData({ money: newMoney });

        if (upd && upd.error && upd.error.message.includes('invalid input syntax')) {
            console.warn('숫자형 저장 실패, 문자열(Text) 타입으로 자동 재시도합니다.');
            upd = await upsertProfileData({ money: String(newMoney) });
        }

        if (upd && upd.error) {
            console.error("소지금 업데이트 실패:", upd.error);
            alert('업데이트 실패!\n사유: ' + upd.error.message);
        } else {
            alert('' + amount.toLocaleString() + ' G 정상 처리 되었습니다.');
            currentMoney = newMoney;
            document.getElementById('current-money-display').innerText = newMoney.toLocaleString() + ' G';
            amtInput.value = '';
            if (typeof loadCharacterData === 'function') loadCharacterData();
            closeModal('money-modal');
        }
    } catch (e) {
        console.error("소지금 통신 에러:", e);
        alert("통신 중 오류가 발생했습니다. 브라우저 콘솔을 확인해주세요.");
    }
};

// ─────────────────────────────────────────────────────────────────
// 8. 인벤토리 미리보기 자동 동기화
// ─────────────────────────────────────────────────────────────────
var _previewTabState = {}; 

window.switchInvPreviewTab = function (charId, tab) {
    _previewTabState[charId] = tab;
    var section = document.getElementById(charId); if (!section) return;
    
    section.querySelectorAll('.inv-preview-tab-btn').forEach(function (btn) {
        var isActive = btn.getAttribute('data-tab') === tab;
        btn.style.background = isActive ? 'rgba(200,200,200,0.25)' : 'rgba(0,0,0,0.3)';
        btn.style.color      = isActive ? '#ffffff' : '#777777';
        btn.style.fontWeight = isActive ? '600' : '400';
    });
    
    if (typeof allProfiles === 'undefined') return;
    
    var currentPhase = window.globalMainPhase || 0;
    var activeProfile = allProfiles.find(function (p) {
        var pid = p.char_id.startsWith('char-') ? p.char_id : 'char-' + p.char_id;
        return pid === charId && p.phase === currentPhase;
    }) || allProfiles.find(function (p) {
        var pid = p.char_id.startsWith('char-') ? p.char_id : 'char-' + p.char_id;
        return pid === charId;
    });

    if (activeProfile) _renderAllSlides(charId, activeProfile, tab);
};

function _renderAllSlides(charId, profile, tab) {
    var section = document.getElementById(charId); if (!section) return;
    var slides  = section.querySelectorAll('.phase-slide');
    slides.forEach(function (slide) {
        var invContainer = slide.querySelector('.rpg-inventory');
        if (!invContainer) return;
        _renderInvIntoContainer(invContainer, profile, tab);
    });
}

function _renderInvIntoContainer(container, profile, tab) {
    if (!document.getElementById('inv-preview-tooltip-style')) {
        var style = document.createElement('style');
        style.id = 'inv-preview-tooltip-style';
        style.textContent = [
            '.inv-slot-hover { position: relative; overflow: visible !important; }',
            '.inv-tooltip-pretty {',
            '    position: absolute; bottom: 115%; left: 50%;',
            '    transform: translateX(-50%) translateY(5px);',
            '    background: linear-gradient(180deg, rgba(40,40,40,0.98) 0%, rgba(20,20,20,0.98) 100%);',
            '    border: 1px solid #aaaaaa; padding: 10px 14px; border-radius: 8px;',
            '    width: max-content; max-width: 220px; z-index: 99999;',
            '    opacity: 0; visibility: hidden; pointer-events: none;',
            '    box-shadow: 0 8px 20px rgba(0,0,0,0.8), inset 0 0 8px rgba(255,255,255,0.1);',
            '    transition: opacity 0.05s ease-out, transform 0.05s ease-out;',
            '    text-align: left; line-height: 1.4;',
            '}',
            '.inv-tooltip-pretty::after {',
            '    content: ""; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);',
            '    border-width: 6px; border-style: solid;',
            '    border-color: #aaaaaa transparent transparent transparent;',
            '}',
            '.inv-slot-hover:hover .inv-tooltip-pretty {',
            '    opacity: 1; visibility: visible; transform: translateX(-50%) translateY(0);',
            '}',
            '.tooltip-title {',
            '    color: #ffffff; display: block; margin-bottom: 6px; font-size: 0.95rem;',
            '    font-weight: 700; border-bottom: 1px dashed rgba(255,255,255,0.4);',
            '    padding-bottom: 4px; text-shadow: 0 1px 2px #000;',
            '}',
            '.tooltip-desc { color: #cccccc; font-size: 0.8rem; white-space: pre-wrap; word-break: break-word; }'
        ].join('\n');
        document.head.appendChild(style);
    }

    var rawSrc = (tab === 'furniture') ? profile.furniture_inventory : profile.inventory;
    var myInv  = [];
    if (typeof rawSrc === 'string') {
        try { myInv = JSON.parse(rawSrc); } catch (e) { myInv = []; }
    } else if (Array.isArray(rawSrc)) {
        myInv = rawSrc.slice();
    }

    var html = '';
    for (var i = 0; i < 20; i++) {
        var item  = myInv[i];
        var name  = '', img = '', count = 1, desc = '';

        if (item && typeof item === 'object' && item.name) {
            name = item.name; img = item.img || ''; count = parseInt(item.count, 10) || 1; desc = item.desc || '';
        } else if (typeof item === 'string' && item.trim() && item.indexOf('[object') === -1) {
            var pts = item.split(':');
            name  = pts[0] || '?';
            desc  = pts[1] || '';
            img   = pts.length > 2 ? pts.slice(2).join(':') : '';
            count = 1;
        }

        if (name) {
            var badge = count > 1
                ? '<div style="position:absolute;top:2px;right:2px;background:#aaaaaa;color:#000;font-size:10px;font-weight:bold;padding:2px 4px;border-radius:4px;z-index:5;">x' + count + '</div>'
                : '';
            var imgSrc   = img || 'https://placehold.co/100?text=Empty';
            var safeDesc = desc ? desc.replace(/"/g, '&quot;') : 'No description available.';
            var tooltipHTML = '<div class="inv-tooltip-pretty">'
                            + '<span class="tooltip-title">[' + name + ']</span>'
                            + '<span class="tooltip-desc">' + safeDesc + '</span>'
                            + '</div>';

            html +=
                '<div class="inv-slot inv-slot-hover" style="position:relative;background:#222;border:1px solid rgba(255,255,255,0.1);aspect-ratio:1;">' +
                tooltipHTML + badge +
                '<img src="' + imgSrc + '" onerror="this.src=\'https://placehold.co/100?text=Error\'" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;z-index:1;">' +
                '<div style="position:absolute;bottom:0;left:0;width:100%;background:rgba(0,0,0,0.7);font-size:10px;color:#ffffff;text-align:center;padding:2px 0;z-index:3;">' + name + '</div>' +
                '</div>';
        } else {
            html += '<div class="inv-slot" style="background:#111111;border:1px solid rgba(255,255,255,0.1);aspect-ratio:1;"></div>';
        }
    }
    container.innerHTML = html;
}

function _ensureInvPreviewTabs(charId) {
    var section = document.getElementById(charId); if (!section) return;
    var slides  = section.querySelectorAll('.phase-slide');
    var tab     = _previewTabState[charId] || 'general';

    slides.forEach(function (slide) {
        var slot = slide.querySelector('.inv-tab-slot');
        if (!slot) return;
        if (slot.querySelector('.inv-preview-tab-btn')) return;

        var gActive      = (tab === 'general');
        var activeStyle  = 'background:linear-gradient(135deg, #bbbbbb, #888888); color:#111; font-weight:bold; box-shadow:0 1px 3px rgba(0,0,0,0.4);';
        var inactiveStyle = 'background:transparent; color:#888; font-weight:400;';
        var baseStyle    = "flex:1; padding:6px 0; font-size:0.75rem; font-family:'Nanum Myeongjo', serif; cursor:pointer; border:none; border-radius:20px; transition:all 0.2s ease; text-align:center; letter-spacing:1px; white-space:nowrap;";

        var btnItems = document.createElement('button');
        btnItems.className = 'inv-preview-tab-btn';
        btnItems.setAttribute('data-tab', 'general');
        btnItems.setAttribute('style', baseStyle + (gActive ? activeStyle : inactiveStyle));
        btnItems.textContent = 'Items';
        btnItems.onclick = function () { switchInvPreviewTab(charId, 'general'); };

        var btnFurn = document.createElement('button');
        btnFurn.className = 'inv-preview-tab-btn';
        btnFurn.setAttribute('data-tab', 'furniture');
        btnFurn.setAttribute('style', baseStyle + (!gActive ? activeStyle : inactiveStyle));
        btnFurn.textContent = 'Storage';
        btnFurn.onclick = function () { switchInvPreviewTab(charId, 'furniture'); };

        slot.appendChild(btnItems);
        slot.appendChild(btnFurn);
    });
}

window.refreshInventoryPreviews = function () {
    if (typeof allProfiles === 'undefined') return;

    var seen = {};
    var currentPhase = window.globalMainPhase || 0;

    allProfiles.forEach(function (profile) {
        var charId = profile.char_id.startsWith('char-') ? profile.char_id : 'char-' + profile.char_id;
        if (profile.phase !== currentPhase) return; 
        if (seen[charId]) return;
        seen[charId] = true;

        _ensureInvPreviewTabs(charId);
        var tab = _previewTabState[charId] || 'general';
        _renderAllSlides(charId, profile, tab);
    });
};

// ─────────────────────────────────────────────────────────────────
// 9. 로딩 시점 동기화 및 전역 BGM 이벤트 후킹 제어
// ─────────────────────────────────────────────────────────────────
var _loadCharHooked = false;
var _hookInterval = setInterval(function () {
    if (typeof window.loadCharacterData === 'function' && !_loadCharHooked) {
        _loadCharHooked = true;
        clearInterval(_hookInterval);

        var _originalLoad = window.loadCharacterData;
        window.loadCharacterData = async function () {
            await _originalLoad.apply(this, arguments);
            window.refreshInventoryPreviews();
        };
    }
}, 200);

var _openTabHooked = false;
var _bgmHookInterval = setInterval(function () {
    if (typeof window.openTab === 'function' && !_openTabHooked) {
        _openTabHooked = true;
        clearInterval(_bgmHookInterval);
        
        var _originalOpenTab = window.openTab;
        window.openTab = function (tabName, btn) {
            _originalOpenTab.apply(this, arguments);
            
            if (tabName.startsWith('char-')) {
                var targetPhase = window.globalMainPhase || 0; 
                
                setTimeout(function() {
                    var section = document.getElementById(tabName);
                    if (section) {
                        var phaseBtns = section.querySelectorAll('.phase-tabs > .phase-btn');
                        if (phaseBtns.length > targetPhase) {
                            var targetBtn = phaseBtns[targetPhase];
                            if (typeof window.changePhase === 'function') {
                                window.changePhase(targetBtn, targetPhase);
                            }
                        }
                    }
                }, 50);

                if (typeof allProfiles !== 'undefined') {
                    var profile = allProfiles.find(function(p) { 
                        var pid = p.char_id.startsWith('char-') ? p.char_id : 'char-' + p.char_id;
                        return pid === tabName && p.phase === targetPhase; 
                    });
                    
                    if (profile && typeof setupCharacterBGM === 'function') {
                        setupCharacterBGM(profile.bgm_url);
                    } else if (typeof setupCharacterBGM === 'function') {
                        setupCharacterBGM(''); 
                    }
                }
            } else {
                if (typeof setupCharacterBGM === 'function') setupCharacterBGM('');
            }
        };
    }
}, 200);

window.setGlobalPhase = function(val) {
    window.globalMainPhase = parseInt(val, 10);
    alert('기준 챕터가 Chapter ' + (window.globalMainPhase + 1) + '으로 변경되었습니다.');
    
    var activeSection = document.querySelector('section.content-card.active');
    if (activeSection && activeSection.id.startsWith('char-')) {
        var phaseBtns = activeSection.querySelectorAll('.phase-tabs > .phase-btn');
        if (phaseBtns.length > window.globalMainPhase) {
            var targetBtn = phaseBtns[window.globalMainPhase];
            if (typeof window.changePhase === 'function') {
                window.changePhase(targetBtn, window.globalMainPhase);
            }
        }
    }
};

// allProfiles 없어도 탭 버튼 보장
function _ensureAllTabsOnLoad() {
    document.querySelectorAll('.inv-tab-slot').forEach(function (slot) {
        if (slot.querySelector('.inv-preview-tab-btn')) return;

        // 부모 section에서 charId 추출
        var section = slot.closest('section[id]');
        if (!section) return;
        var charId = section.id;

        var tab          = _previewTabState[charId] || 'general';
        var gActive      = (tab === 'general');
        var activeStyle  = 'background:linear-gradient(135deg, #bbbbbb, #888888); color:#111; font-weight:bold; box-shadow:0 1px 3px rgba(0,0,0,0.4);';
        var inactiveStyle = 'background:transparent; color:#888; font-weight:400;';
        var baseStyle    = "flex:1; padding:6px 0; font-size:0.75rem; font-family:'Nanum Myeongjo', serif; cursor:pointer; border:none; border-radius:20px; transition:all 0.2s ease; text-align:center; letter-spacing:1px; white-space:nowrap;";

        var btnItems = document.createElement('button');
        btnItems.className = 'inv-preview-tab-btn';
        btnItems.setAttribute('data-tab', 'general');
        btnItems.setAttribute('style', baseStyle + (gActive ? activeStyle : inactiveStyle));
        btnItems.textContent = 'Items';
        btnItems.onclick = function () { switchInvPreviewTab(charId, 'general'); };

        var btnFurn = document.createElement('button');
        btnFurn.className = 'inv-preview-tab-btn';
        btnFurn.setAttribute('data-tab', 'furniture');
        btnFurn.setAttribute('style', baseStyle + (!gActive ? activeStyle : inactiveStyle));
        btnFurn.textContent = 'Storage';
        btnFurn.onclick = function () { switchInvPreviewTab(charId, 'furniture'); };

        slot.appendChild(btnItems);
        slot.appendChild(btnFurn);
    });
}

// 페이지 로드 후 500ms 뒤 실행 (initCharacterPages 완료 보장)
setTimeout(_ensureAllTabsOnLoad, 500);
