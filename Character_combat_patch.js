/* ================================================================= */
/* character_combat_patch.js                                        */
/* 로드 순서: Character.js 다음, Myroom.js 이전                     */
/* */
/* 기능 1: 기본 정보 모달에 전투 이미지 업로드 섹션 주입            */
/* 기능 2: 인벤토리 JSON/문자열 방식 통합 렌더링                    */
/* ================================================================= */

/* ─────────────────────────────────────────────────────────────────
   1. openGeneralModal 래핑 — 전투 이미지 섹션 동적 주입
───────────────────────────────────────────────────────────────── */
(function patchCombatImg() {
    var _orig = window.openGeneralModal;
    
    // 원본 함수가 완전히 로드될 때까지 대기합니다.
    if (typeof _orig !== 'function') { setTimeout(patchCombatImg, 500); return; }
    
    // 기본 모달 열기 함수를 가로채어 실행 후 UI 주입을 예약합니다.
    window.openGeneralModal = function (charId, phaseIdx) {
        _orig(charId, phaseIdx);
        // 모달 렌더링 시간을 확보하기 위해 100ms 지연 후 섹션을 주입합니다.
        setTimeout(function () { _injectCombatImgSection(charId); }, 100);
    };
})();

function _injectCombatImgSection(charId) {
    var modal = document.getElementById('edit-modal');
    
    // 모달이 존재하지 않거나, 이미 전투 이미지 섹션이 주입된 경우 중단합니다.
    if (!modal || modal.querySelector('#combat-img-section')) return;

    // 전역 프로필 데이터(allProfiles)에서 현재 캐릭터의 1부(phase 0) 데이터를 가져옵니다.
    var profile = (typeof allProfiles !== 'undefined')
        ? allProfiles.find(function (p) { return p.char_id === charId && p.phase === 0; })
        : null;
    var cur = (profile && profile.combat_img) ? profile.combat_img : '';

    var saveBtn = modal.querySelector('#save-btn');
    if (!saveBtn) return;

    // 등록된 이미지가 있으면 썸네일을, 없으면 영문 안내 문구를 출력합니다.
    var previewHTML = cur
        ? '<img src="' + cur + '" style="width:80px;height:107px;object-fit:cover;object-position:top;border-radius:4px;margin-bottom:10px;display:block;">'
        : '<div style="color:#555555;font-size:0.8rem;margin-bottom:10px;">No combat image (Default profile image in use)</div>';

    var section = document.createElement('div');
    section.id = 'combat-img-section';
    
    // 이모지를 배제하고 무채색(흑백) 기반의 모노톤 스타일을 적용합니다.
    section.style.cssText = 'margin-top:20px;background:rgba(0,0,0,0.4);padding:16px;border-radius:10px;border:1px dashed rgba(255,255,255,0.3);';
    section.innerHTML =
        '<h3 style="font-size:1rem;color:#cccccc;margin:0 0 10px;">Combat Image</h3>' +
        '<p style="color:#777777;font-size:0.78rem;margin-bottom:12px;line-height:1.5;">Image displayed in team battlegrounds.<br>Vertical (3:4 ratio) recommended.</p>' +
        previewHTML +
        '<div style="display:flex;gap:10px;align-items:center;">' +
        '<input type="file" id="combat-img-file" accept="image/*" style="flex:1;color:#aaaaaa;font-size:0.82rem;">' +
        '<button onclick="saveCombatImg(\'' + charId + '\')" class="auth-btn" style="width:100px;margin:0;padding:8px 0;font-size:0.85rem;background:#333333;color:#ffffff;border:1px solid #555555;">Save Image</button>' +
        '</div>' +
        '<div id="combat-img-status" style="margin-top:8px;font-size:0.8rem;color:#aaaaaa;"></div>';

    // 기존 저장 버튼의 바로 윗부분에 생성한 섹션을 삽입합니다.
    saveBtn.parentNode.insertBefore(section, saveBtn);
}

/* ─────────────────────────────────────────────────────────────────
   2. 전투 이미지 외부 호스팅 업로드 및 DB 저장
───────────────────────────────────────────────────────────────── */
window.saveCombatImg = async function (charId) {
    var fileInput = document.getElementById('combat-img-file');
    var status    = document.getElementById('combat-img-status');
    
    // 파일 유효성 검사
    if (!fileInput || !fileInput.files.length) {
        if (status) status.innerText = 'Please select a file.';
        return;
    }
    if (!currentUser) { alert('로그인이 필요합니다.'); return; }
    if (status) status.innerText = 'Uploading...';

    // 외부 호스팅(Imgbb 등)으로 이미지 전송
    var url = await uploadToImgbb(fileInput.files[0]);
    if (!url) { if (status) status.innerText = 'Upload failed. Please try again.'; return; }

    // 데이터베이스 업데이트
    var res = await supabaseClient.from('character_profiles').update({ combat_img: url }).eq('char_id', charId).eq('phase', 0);
    if (res.error) { if (status) status.innerText = 'Save failed: ' + res.error.message; return; }

    // 프론트엔드 캐시 배열(allProfiles) 데이터 동기화
    if (typeof allProfiles !== 'undefined') {
        var cached = allProfiles.find(function (p) { return p.char_id === charId && p.phase === 0; });
        if (cached) cached.combat_img = url;
    }
    if (status) status.innerText = 'Combat image saved!';

    // 모달을 닫지 않고 UI 상의 이미지를 즉각 교체합니다.
    var section = document.getElementById('combat-img-section');
    if (section) {
        var oldImg = section.querySelector('img');
        var oldMsg = section.querySelector('div[style*="color:#555"]');
        if (oldImg) { 
            oldImg.src = url; 
        } else if (oldMsg) {
            var img = document.createElement('img');
            img.src = url;
            img.style.cssText = 'width:80px;height:107px;object-fit:cover;object-position:top;border-radius:4px;margin-bottom:10px;display:block;';
            oldMsg.replaceWith(img);
        }
    }
};

/* ─────────────────────────────────────────────────────────────────
   3. loadCharacterData 래핑 — 인벤토리 렌더링 함수 자동 호출
───────────────────────────────────────────────────────────────── */
(function patchInventoryRender() {
    var _orig = window.loadCharacterData;
    if (typeof _orig !== 'function') { setTimeout(patchInventoryRender, 300); return; }
    
    // 중복으로 래핑되는 것을 방지합니다.
    if (_orig._invPatched) return;
    
    var wrapped = async function () {
        await _orig.apply(this, arguments);
        _reRenderAllInventories();
    };
    wrapped._invPatched = true;
    window.loadCharacterData = wrapped;
})();

/* ─────────────────────────────────────────────────────────────────
   4. 인벤토리 범용 파서 (JSON, 문자열 배열, 객체 배열 모두 호환)
───────────────────────────────────────────────────────────────── */
function _parseInventoryUniversal(raw) {
    // 빈 데이터일 경우 20개의 null로 채워진 규격 배열 반환
    if (!raw) return new Array(20).fill(null);
    var arr = [];

    if (typeof raw === 'string' && raw.trim().startsWith('[')) {
        // 1. 최신 방식: 정상적인 JSON 배열 문자열
        try { arr = JSON.parse(raw); } catch (e) { arr = []; }
    } else if (typeof raw === 'string') {
        // 2. 구 방식: 콤마(,)로 분리된 문자열
        arr = raw.split(',').map(function (s) {
            var t = s.trim();
            if (!t || t.indexOf('[object') !== -1) return null;
            if (t.startsWith('{')) { try { return JSON.parse(t); } catch (e) {} }
            if (t.indexOf(':') !== -1) {
                var p = t.split(':');
                return { name: p[0] || '', desc: p[1] || '', img: p.slice(2).join(':'), count: 1 };
            }
            return null;
        });
    } else if (Array.isArray(raw)) {
        // 3. 이미 파싱된 배열 객체
        arr = raw;
    }

    var result = [];
    // 어떠한 데이터 형태가 들어와도 인벤토리 20칸 규격을 유지하도록 순회합니다.
    for (var i = 0; i < 20; i++) {
        var item = arr[i];
        if (!item) { result.push(null); continue; }
        
        if (typeof item === 'object' && item.name) {
            result.push({ name: item.name, desc: item.desc || '', img: item.img || '', count: parseInt(item.count) || 1 });
        } else if (typeof item === 'string' && item.trim() && item.indexOf('[object') === -1) {
            var p2 = item.split(':');
            result.push({ name: p2[0] || '', desc: p2[1] || '', img: p2.slice(2).join(':'), count: 1 });
        } else {
            result.push(null);
        }
    }
    return result;
}

/* ─────────────────────────────────────────────────────────────────
   5. 전역 인벤토리 UI 재렌더링
───────────────────────────────────────────────────────────────── */
function _reRenderAllInventories() {
    if (typeof allProfiles === 'undefined') return;
    var PH = (typeof PLACEHOLDER_ITEM !== 'undefined') ? PLACEHOLDER_ITEM : 'https://placehold.co/100x100?text=?';

    allProfiles.forEach(function (profile) {
        var section = document.getElementById(profile.char_id);
        if (!section || !profile.inventory) return;
        
        var targetSlide = section.querySelectorAll('.phase-slide')[profile.phase || 0];
        if (!targetSlide) return;
        
        var invWrapper = targetSlide.querySelector('.rpg-inventory');
        if (!invWrapper) return;

        var parsed = _parseInventoryUniversal(profile.inventory);
        var html = '';
        
        for (var i = 0; i < 20; i++) {
            var item = parsed[i];
            if (item && item.name) {
                // 수량 뱃지에 흑백 모노톤 스타일 적용
                var badge = item.count > 1
                    ? '<div style="position:absolute;top:2px;right:2px;background:#555555;color:#ffffff;font-size:10px;font-weight:bold;padding:1px 4px;border-radius:3px;z-index:10;">x' + item.count + '</div>'
                    : '';
                html += '<div class="inv-slot" style="position:relative;overflow:hidden;">' +
                    badge +
                    '<img src="' + (item.img || PH) + '" onerror="this.src=\'' + PH + '\'" style="width:100%;height:100%;object-fit:cover;">' +
                    '<div class="item-tooltip"><span class="item-title">' + item.name + '</span>' + (item.desc || '') + '</div>' +
                    '</div>';
            } else {
                html += '<div class="inv-slot"></div>';
            }
        }
        invWrapper.innerHTML = html;
        
        // 이후 다른 로직에서 조회할 수 있도록 DOM 속성에 파싱된 데이터를 문자열로 저장합니다.
        invWrapper.setAttribute('data-inventory', JSON.stringify(parsed));
    });
}
