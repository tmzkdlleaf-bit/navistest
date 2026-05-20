/* ================================================================= */
/*  character_combat_patch.js                                        */
/*  로드 순서: Character.js?v=9 다음, Myroom.js 이전                 */
/*                                                                   */
/*  [주요 기능]                                                      */
/*  기능 1: 기본 정보 모달에 전투 이미지(Combat Image) 업로드 섹션 주입 */
/*  기능 2: 인벤토리 JSON/문자열 방식 통합 파싱 및 렌더링 보완       */
/*                                                                   */
/*  * 본 패치는 4인 파티(Character A, B, C, D) 기준으로 동작하며,    */
/*    모든 데이터 참조 및 갱신은 4인 캐릭터의 상태를 기반으로 합니다. */
/* ================================================================= */

/* ─────────────────────────────────────────────────────────────────
   1. openGeneralModal 함수 래핑 (후킹)
   - 목적: 기존에 작성된 '기본 정보 편집 모달'이 열릴 때, 
           전투 전용 이미지 업로드 UI를 동적으로 끼워 넣습니다.
───────────────────────────────────────────────────────────────── */
(function patchCombatImg() {
    // 기존의 openGeneralModal 함수를 백업합니다.
    var _orig = window.openGeneralModal;
    
    // 만약 기존 함수가 아직 로드되지 않았다면 0.5초 뒤에 재시도합니다.
    if (typeof _orig !== 'function') { 
        setTimeout(patchCombatImg, 500); 
        return; 
    }
    
    // 기존 함수를 새로운 함수로 덮어씌웁니다.
    window.openGeneralModal = function (charId, phaseIdx) {
        _orig(charId, phaseIdx); // 기존 로직(모달 열기 및 기존 데이터 세팅) 실행
        
        // DOM이 완전히 그려질 시간을 벌기 위해 0.1초 대기 후 전투 이미지 섹션을 주입합니다.
        setTimeout(function () { 
            _injectCombatImgSection(charId); 
        }, 100);
    };
})();

/**
 * 모달 내부에 전투 이미지 업로드 섹션을 생성하고 삽입하는 함수
 * @param {string} charId - 대상 캐릭터 ID (예: 'char-ho1' ~ 'char-ho4')
 */
function _injectCombatImgSection(charId) {
    var modal = document.getElementById('edit-modal');
    // 모달이 없거나 이미 섹션이 주입되어 있다면 중복 실행을 막습니다.
    if (!modal || modal.querySelector('#combat-img-section')) return;

    // 4인 파티 데이터(allProfiles)에서 현재 캐릭터의 파트1(phase 0) 데이터를 찾습니다.
    var profile = (typeof allProfiles !== 'undefined')
        ? allProfiles.find(function (p) { return p.char_id === charId && p.phase === 0; })
        : null;
        
    // 전투 이미지가 존재하면 가져오고, 없으면 빈 문자열 처리
    var cur = (profile && profile.combat_img) ? profile.combat_img : '';

    var saveBtn = modal.querySelector('#save-btn');
    if (!saveBtn) return;

    // 현재 설정된 전투 이미지가 있다면 미리보기(img)를, 없다면 안내 문구를 렌더링 (더미 플레이스홀더 방식 적용)
    var previewHTML = cur
        ? '<img src="' + cur + '" style="width:80px;height:107px;object-fit:cover;object-position:top;border-radius:4px;margin-bottom:10px;display:block;" alt="전투 이미지 미리보기">'
        : '<div style="color:#555;font-size:0.8rem;margin-bottom:10px;">현재 전투 이미지 없음 (기본 프로필 이미지가 대체 사용됩니다)</div>';

    // 주입할 컨테이너 생성 및 스타일링
    var section = document.createElement('div');
    section.id = 'combat-img-section';
    section.style.cssText = 'margin-top:20px;background:rgba(0,0,0,0.4);padding:16px;border-radius:10px;border:1px dashed rgba(215,179,61,0.3);';
    section.innerHTML =
        '<h3 style="font-size:1rem;color:var(--accent-color);margin:0 0 10px;">&#9876; 전투 이미지 (4인 파티 대련용)</h3>' +
        '<p style="color:#777;font-size:0.78rem;margin-bottom:12px;line-height:1.5;">팀전 등 전투 전장에서 표시될 캐릭터의 전신/반신 이미지입니다.<br>세로형(3:4 비율)을 권장합니다.</p>' +
        previewHTML +
        '<div style="display:flex;gap:10px;align-items:center;">' +
        '<input type="file" id="combat-img-file" accept="image/*" style="flex:1;color:#aaa;font-size:0.82rem;">' +
        '<button onclick="saveCombatImg(\'' + charId + '\')" class="auth-btn" style="width:100px;margin:0;padding:8px 0;font-size:0.85rem;">이미지 저장</button>' +
        '</div>' +
        '<div id="combat-img-status" style="margin-top:8px;font-size:0.8rem;color:#aaa;"></div>';

    // 기존 '저장' 버튼 바로 위에 전투 이미지 섹션을 삽입합니다.
    saveBtn.parentNode.insertBefore(section, saveBtn);
}


/* ─────────────────────────────────────────────────────────────────
   2. 전투 이미지 업로드 및 DB 저장
   - imgbb (또는 설정된 API)를 통해 이미지를 업로드하고 Supabase DB를 갱신합니다.
───────────────────────────────────────────────────────────────── */
window.saveCombatImg = async function (charId) {
    var fileInput = document.getElementById('combat-img-file');
    var status    = document.getElementById('combat-img-status');
    
    if (!fileInput || !fileInput.files.length) {
        if (status) status.innerText = '업로드할 파일(더미 이미지 등)을 선택해주세요.';
        return;
    }
    if (!currentUser) { 
        alert('로그인이 필요합니다.'); 
        return; 
    }
    
    if (status) status.innerText = '이미지 업로드 중...';

    // 외부 이미지 호스팅(imgbb)에 업로드 요청
    var url = await uploadToImgbb(fileInput.files[0]);
    if (!url) { 
        if (status) status.innerText = '업로드 실패. 네트워크 상태를 확인해주세요.'; 
        return; 
    }

    // 4인 파티 DB 테이블(character_profiles) 업데이트
    var res = await supabaseClient.from('character_profiles')
        .update({ combat_img: url })
        .eq('char_id', charId)
        .eq('phase', 0);
        
    if (res.error) { 
        if (status) status.innerText = 'DB 저장 실패: ' + res.error.message; 
        return; 
    }

    // 전역 변수에 캐싱된 4인 파티 데이터(allProfiles)도 동기화
    if (typeof allProfiles !== 'undefined') {
        var cached = allProfiles.find(function (p) { return p.char_id === charId && p.phase === 0; });
        if (cached) cached.combat_img = url;
    }
    
    if (status) status.innerText = '전투 이미지 저장 및 적용 완료!';

    // 모달 내 미리보기 UI 즉시 업데이트
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
   3. loadCharacterData 래핑 — 인벤토리 재렌더링 강제 실행
   - 목적: DB에서 4인 파티 데이터를 불러온 후, 인벤토리 파싱 로직을 
           안전하게 거쳐 UI를 갱신하도록 강제합니다.
───────────────────────────────────────────────────────────────── */
(function patchInventoryRender() {
    var _orig = window.loadCharacterData;
    if (typeof _orig !== 'function') { 
        setTimeout(patchInventoryRender, 300); 
        return; 
    }
    
    // 중복 패치 방지
    if (_orig._invPatched) return;
    
    var wrapped = async function () {
        await _orig.apply(this, arguments); // 기존 데이터 로드 실행
        _reRenderAllInventories();          // 로드 후 인벤토리 UI 강제 재렌더링
    };
    
    wrapped._invPatched = true;
    window.loadCharacterData = wrapped;
})();


/* ─────────────────────────────────────────────────────────────────
   4. 인벤토리 파싱 유틸리티 (호환성 패치)
   - 목적: DB에 저장된 인벤토리 데이터가 JSON 배열이든, 구형 쉼표(,) 구분 문자열이든 
           상관없이 항상 20칸짜리 규격화된 배열 객체로 반환합니다.
───────────────────────────────────────────────────────────────── */
function _parseInventoryUniversal(raw) {
    // 데이터가 아예 없으면 20칸의 빈 슬롯(null) 배열 반환
    if (!raw) return new Array(20).fill(null);
    var arr = [];

    // 1) JSON 형태의 문자열일 경우
    if (typeof raw === 'string' && raw.trim().startsWith('[')) {
        try { arr = JSON.parse(raw); } catch (e) { arr = []; }
    } 
    // 2) 레거시 쉼표(,) 구분 문자열일 경우 (예: "아이템1:설명:이미지,아이템2:설명:이미지")
    else if (typeof raw === 'string') {
        arr = raw.split(',').map(function (s) {
            var t = s.trim();
            // 잘못 삽입된 [object Object] 쓰레기 데이터 필터링
            if (!t || t.indexOf('[object') !== -1) return null;
            
            // 부분적으로 JSON 객체 형태인 경우
            if (t.startsWith('{')) { 
                try { return JSON.parse(t); } catch (e) {} 
            }
            // "이름:설명:이미지경로" 형태인 경우 분리
            if (t.indexOf(':') !== -1) {
                var p = t.split(':');
                return { name: p[0] || '', desc: p[1] || '', img: p.slice(2).join(':'), count: 1 };
            }
            return null;
        });
    } 
    // 3) 이미 파싱된 배열 객체일 경우
    else if (Array.isArray(raw)) {
        arr = raw;
    }

    // 4인 파티의 공통 인벤토리 규격인 20칸(slots)으로 정규화
    var result = [];
    for (var i = 0; i < 20; i++) {
        var item = arr[i];
        if (!item) { 
            result.push(null); 
            continue; 
        }
        
        // 데이터가 객체 포맷인 경우
        if (typeof item === 'object' && item.name) {
            result.push({ 
                name: item.name, 
                desc: item.desc || '', 
                img: item.img || '', 
                count: parseInt(item.count) || 1 
            });
        } 
        // 데이터가 문자열 포맷인 경우 (안전 장치)
        else if (typeof item === 'string' && item.trim() && item.indexOf('[object') === -1) {
            var p2 = item.split(':');
            result.push({ 
                name: p2[0] || '', 
                desc: p2[1] || '', 
                img: p2.slice(2).join(':'), 
                count: 1 
            });
        } else {
            result.push(null); // 규격에 맞지 않으면 빈 슬롯 처리
        }
    }
    return result;
}


/* ─────────────────────────────────────────────────────────────────
   5. 전체 파티원 인벤토리 UI 렌더링
   - 목적: 4인(char-ho1 ~ char-ho4)의 인벤토리를 순회하며 
           각 캐릭터 페이지의 20칸 그리드 DOM을 최신 데이터로 업데이트합니다.
───────────────────────────────────────────────────────────────── */
function _reRenderAllInventories() {
    if (typeof allProfiles === 'undefined') return;
    
    // 이미지가 없을 때 표시할 더미 플레이스홀더 이미지
    var PH = (typeof PLACEHOLDER_ITEM !== 'undefined') ? PLACEHOLDER_ITEM : 'https://placehold.co/100x100/111111/555555?text=?';

    // 4인 파티 전체 데이터를 순회
    allProfiles.forEach(function (profile) {
        var section = document.getElementById(profile.char_id);
        if (!section || !profile.inventory) return;
        
        // 현재 선택된 타임라인(phase)에 해당하는 슬라이드 탐색
        var targetSlide = section.querySelectorAll('.phase-slide')[profile.phase || 0];
        if (!targetSlide) return;
        
        var invWrapper = targetSlide.querySelector('.rpg-inventory');
        if (!invWrapper) return;

        // 범용 파서를 이용해 데이터를 정리
        var parsed = _parseInventoryUniversal(profile.inventory);
        var html = '';
        
        // 20칸 인벤토리 DOM 조립
        for (var i = 0; i < 20; i++) {
            var item = parsed[i];
            
            // 슬롯에 아이템이 존재할 경우
            if (item && item.name) {
                // 아이템 갯수(count)가 2 이상일 경우 우측 상단에 배지(Badge) 표시
                var badge = item.count > 1
                    ? '<div style="position:absolute;top:2px;right:2px;background:#d7b33d;color:#000;font-size:10px;font-weight:bold;padding:1px 4px;border-radius:3px;z-index:10;">x' + item.count + '</div>'
                    : '';
                    
                html += '<div class="inv-slot" style="position:relative;overflow:hidden;">' +
                    badge +
                    '<img src="' + (item.img || PH) + '" onerror="this.src=\'' + PH + '\'" style="width:100%;height:100%;object-fit:cover;" alt="' + item.name + '">' +
                    '<div class="item-tooltip"><span class="item-title">' + item.name + '</span>' + (item.desc || '설명 없음') + '</div>' +
                    '</div>';
            } 
            // 슬롯이 비어있을 경우
            else {
                html += '<div class="inv-slot"></div>';
            }
        }
        
        // DOM에 삽입 및 향후 저장을 위해 최신화된 JSON을 data 속성에 기록
        invWrapper.innerHTML = html;
        invWrapper.setAttribute('data-inventory', JSON.stringify(parsed));
    });
}
