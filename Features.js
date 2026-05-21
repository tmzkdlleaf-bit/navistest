/* ================================================================= */
/* Features.js                                                        */
/*                                                                   */
/* 이 파일이 담당하는 기능:                                            */
/*   1. 갤러리   — 게시글 / 답글 작성, 삭제, 페이지 전환              */
/*   2. 상점     — 아이템 목록 렌더링, 구매, 인벤토리 / 우편함 입고   */
/*   3. 캘린더   — 월별 일정 표시, 추가, 삭제                         */
/*   4. 미니게임 — 동전 던지기 / 야바위 / 사냥터 / 낚시               */
/*   5. 증권거래소 — 실시간 주가 시뮬레이션, 매수 / 매도              */
/*   6. 탭 전환 & 타임라인 동기화                                     */
/*                                                                   */
/* ✏️  수정 가이드:                                                   */
/*   - 상점 아이템  : 섹션 2의 window.shopItems 배열을 수정하세요.    */
/*   - 미니게임 보상: 각 게임 함수 안의 reward 값을 수정하세요.        */
/*   - 주식 기업명  : 섹션 5의 datasets label 을 바꾸세요.            */
/* ================================================================= */


/* ================================================================= */
/* 1. 갤러리 (이미지 / 텍스트 게시판)                                  */
/* ================================================================= */

/*
 * [헬퍼] _getGalleryPhase
 *
 * 갤러리 섹션(#Gallery)에서 현재 활성화된 탭(챕터) 번호를 읽어옵니다.
 *
 * 왜 별도 함수인가요?
 *   전역 변수 currentEditingPhase 는 캐릭터 편집 모달에서도 사용됩니다.
 *   모달이 열린 채로 갤러리 탭을 바꾸면 값이 엉킬 수 있어,
 *   갤러리 전용으로 DOM 에서 직접 활성 탭을 읽는 방식을 씁니다.
 *
 * 반환값: 0(1부) ~ 3(4부)
 */
function _getGalleryPhase() {
    var galSection = document.getElementById('Gallery');
    if (!galSection) return 0;
    var btns = galSection.querySelectorAll('.phase-tabs .phase-btn');
    for (var i = 0; i < btns.length; i++) {
        if (btns[i].classList.contains('active')) return i;
    }
    return 0;
}

/*
 * [함수] loadGalleryData
 *
 * DB(gallery_posts)에서 현재 챕터의 게시글을 불러와 화면에 렌더링합니다.
 * 갤러리 탭 열기, 챕터 전환, 게시 / 삭제 후 새로고침 때 호출됩니다.
 *
 * 매개변수:
 *   page — 표시할 페이지 번호 (1부터 시작, 기본값 1)
 *
 * 처리 순서:
 *   1. DB 에서 현재 챕터 게시글 전체 조회 (오래된 순)
 *   2. 본문(parent_id 없음)과 답글(parent_id 있음)로 분리
 *   3. 페이지네이션 계산 후 현재 페이지 게시글만 잘라냄
 *   4. 각 게시글 카드 HTML 생성 (답글 포함)
 *   5. 페이지네이션 버튼 HTML 생성
 *   6. gallery-list-container 에 최종 HTML 삽입
 */
async function loadGalleryData(page) {
    page               = page || 1;
    currentGalleryPage = page;

    var container = document.getElementById('gallery-list-container');
    if (!container) return;

    /* DB 조회 — 현재 갤러리 챕터(phase)에 해당하는 글만, 오래된 순 */
    var res = await supabaseClient
        .from('gallery_posts')
        .select('*')
        .eq('phase', _getGalleryPhase())
        .order('created_at', { ascending: true });

    var data  = res.data;
    var error = res.error;

    if (error || !data || data.length === 0) {
        container.innerHTML = error
            ? '<p style="color:#555;text-align:center;">데이터를 불러오는 중 오류가 발생했습니다.</p>'
            : '<p style="color:#555;text-align:center;padding:40px 0;">첫 번째 기록을 남겨보세요.</p>';
        return;
    }

    /*
     * parent_id 가 없는 게시글 → 본문 (mainPosts)
     * parent_id 가 있는 게시글 → 답글  (replies)
     */
    var mainPosts  = data.filter(function (p) { return !p.parent_id; });
    var replies    = data.filter(function (p) { return  p.parent_id; });

    var totalPages = Math.ceil(mainPosts.length / GALLERY_POSTS_PER_PAGE);
    var startIndex = (currentGalleryPage - 1) * GALLERY_POSTS_PER_PAGE;
    var currPosts  = mainPosts.slice(startIndex, startIndex + GALLERY_POSTS_PER_PAGE);

    /* 로그인한 사용자의 캐릭터 ID (본인 글에만 삭제 버튼 표시) */
    var myCharId = currentUser ? charOwners[currentUser.email] : null;

    var html = '';

    currPosts.forEach(function (post) {

        var isMine    = myCharId === post.char_id;
        var deleteBtn = isMine
            ? '<button class="btn-reply" onclick="deleteGalleryPost(' + post.id + ')">삭제</button>'
            : '';

        var postReplies = replies.filter(function (r) { return r.parent_id == post.id; });
        var replyCount  = postReplies.length;

        /* 답글이 1개 이상이면 토글 버튼 생성 */
        var toggleBtn = replyCount > 0
            ? '<button class="btn-toggle-replies" onclick="toggleReplies(' + post.id + ')">답글 ' + replyCount + '개 보기</button>'
            : '';

        /* 각 답글을 reply-item div 로 변환 */
        var repliesHtml = postReplies.map(function (r) {
            var isReplyMine    = myCharId === r.char_id;
            var replyDeleteBtn = isReplyMine
                ? '<button class="btn-reply" style="padding:4px 10px;font-size:0.75rem;margin-top:0;" onclick="deleteGalleryPost(' + r.id + ')">삭제</button>'
                : '';
            return '<div class="reply-item">' +
                (r.image_url
                    ? '<img src="' + r.image_url + '" class="reply-img" onclick="openLightbox(this.src)">'
                    : '') +
                '<div class="post-info">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                        '<div class="post-author" style="font-size:0.9rem;margin-bottom:0;">' + r.char_name + '</div>' +
                        replyDeleteBtn +
                    '</div>' +
                    '<div class="post-content" style="font-size:0.9rem;margin-top:5px;">' + (r.content || '') + '</div>' +
                '</div></div>';
        }).join('');

        html +=
            '<div class="gallery-post-container">' +
                '<div class="post-main">' +
                    (post.image_url
                        ? '<img src="' + post.image_url + '" class="post-img" onclick="openLightbox(this.src)">'
                        : '') +
                    '<div class="post-info">' +
                        '<div class="post-author">' + post.char_name + '</div>' +
                        '<div class="post-date">'   + new Date(post.created_at).toLocaleString() + '</div>' +
                        '<div class="post-content">' + (post.content || '') + '</div>' +
                        '<div style="display:flex;gap:10px;margin-top:10px;align-items:center;">' +
                            '<button class="btn-reply" onclick="showReplyForm(' + post.id + ')">답글 달기</button>' +
                            deleteBtn +
                        '</div>' +
                        toggleBtn +
                    '</div>' +
                '</div>' +
                /* 답글 컨테이너 — 기본 숨김, toggleReplies() 로 열고 닫음 */
                '<div class="post-replies" id="replies-' + post.id + '" style="display:none;">' + repliesHtml + '</div>' +
            '</div>';
    });

    if (totalPages > 1) {
        html += '<div class="gallery-pagination">';
        for (var i = 1; i <= totalPages; i++) {
            html += '<button class="page-btn ' + (i === currentGalleryPage ? 'active' : '') +
                    '" onclick="loadGalleryData(' + i + ')">' + i + '</button>';
        }
        html += '</div>';
    }

    container.innerHTML = html;
}

/*
 * [함수] toggleReplies
 *
 * 특정 게시글의 답글 목록을 펼치거나 접습니다.
 * 버튼 텍스트에서 '보기' ↔ '닫기' 를 교체합니다.
 *
 * 매개변수:
 *   postId — 대상 게시글의 DB id
 */
window.toggleReplies = function (postId) {
    var repliesDiv = document.getElementById('replies-' + postId);
    var btn        = document.querySelector('button[onclick="toggleReplies(' + postId + ')"]');
    if (!repliesDiv || !btn) return;

    var isHidden             = repliesDiv.style.display === 'none';
    repliesDiv.style.display = isHidden ? 'flex' : 'none';
    btn.innerText = btn.innerText.replace(
        isHidden ? '보기' : '닫기',
        isHidden ? '닫기' : '보기'
    );
};

/*
 * [함수] showReplyForm
 *
 * 답글 작성 모달을 엽니다.
 * hidden input 에 원본 게시글 ID 를 저장해 submitReply() 에서 참조합니다.
 *
 * 매개변수:
 *   parentId — 답글을 달 원본 게시글의 id
 */
window.showReplyForm = function (parentId) {
    document.getElementById('reply-parent-id').value     = parentId;
    document.getElementById('reply-modal-content').value = '';
    document.getElementById('reply-modal-file').value    = '';
    document.getElementById('reply-modal').classList.add('show');
};

/*
 * [함수] uploadGalleryPost
 *
 * 새 게시글을 작성합니다.
 * 이미지가 첨부되어 있으면 먼저 ImgBB 에 업로드한 뒤 URL 을 DB 에 저장합니다.
 *
 * 처리 순서:
 *   1. 로그인 / 권한 확인
 *   2. 내용 또는 이미지 중 하나 이상 있는지 확인
 *   3. 이미지가 있으면 ImgBB 업로드 (Auth.js 의 uploadToImgbb 사용)
 *   4. gallery_posts 테이블에 INSERT
 *   5. 성공 시 입력 초기화 및 목록 새로고침
 */
window.uploadGalleryPost = async function () {
    if (!currentUser)                  return alert('로그인이 필요합니다.');
    var myCharId = charOwners[currentUser.email];
    if (!myCharId)                     return alert('권한이 없습니다.');

    var content   = document.getElementById('gal-content').value;
    var fileInput = document.getElementById('gal-file');
    if (!content && fileInput.files.length === 0) return alert('내용이나 이미지를 입력해주세요.');

    var uploadedUrl = null;
    if (fileInput.files.length > 0) {
        var btn = event.target;
        btn.innerText = '전송중...'; btn.disabled = true;
        uploadedUrl   = await uploadToImgbb(fileInput.files[0]);
        if (!uploadedUrl) {
            alert('이미지 업로드 실패.');
            btn.innerText = '기록'; btn.disabled = false;
            return;
        }
    }

    /* Config.js 의 charData 배열에서 이름 조회 */
    var charName = (charData.find(function (c) {
        return c.id === myCharId.replace('char-', '');
    }) || {}).name || '익명';

    var res = await supabaseClient.from('gallery_posts').insert([{
        char_id:   myCharId,
        char_name: charName,
        content:   content,
        image_url: uploadedUrl,
        parent_id: null,               /* 본문이므로 null */
        phase:     _getGalleryPhase(),
    }]);

    if (res.error) {
        alert('저장 실패');
    } else {
        document.getElementById('gal-content').value = '';
        document.getElementById('gal-file').value    = '';
        if (fileInput.files.length > 0) { event.target.innerText = '기록'; event.target.disabled = false; }
        loadGalleryData(currentGalleryPage);
    }
};

/*
 * [함수] submitReply
 *
 * 답글을 작성합니다.
 * uploadGalleryPost 와 거의 동일하지만 parent_id 를 설정한다는 점이 다릅니다.
 * 작성 성공 시 해당 게시글의 답글 컨테이너를 자동으로 펼칩니다.
 */
window.submitReply = async function () {
    var parentId = document.getElementById('reply-parent-id').value;
    if (!currentUser)                  return alert('로그인이 필요합니다.');
    var myCharId = charOwners[currentUser.email];
    if (!myCharId)                     return alert('권한이 없습니다.');

    var content   = document.getElementById('reply-modal-content').value;
    var fileInput = document.getElementById('reply-modal-file');
    if (!content && fileInput.files.length === 0) return alert('내용이나 이미지를 입력해주세요.');

    var uploadedUrl = null;
    if (fileInput.files.length > 0) {
        var btn = event.target;
        btn.innerText = '전송중...'; btn.disabled = true;
        uploadedUrl   = await uploadToImgbb(fileInput.files[0]);
        if (!uploadedUrl) {
            alert('이미지 업로드 실패.');
            btn.innerText = '기록'; btn.disabled = false;
            return;
        }
    }

    var charName = (charData.find(function (c) {
        return c.id === myCharId.replace('char-', '');
    }) || {}).name || '익명';

    var res = await supabaseClient.from('gallery_posts').insert([{
        char_id:   myCharId,
        char_name: charName,
        content:   content,
        image_url: uploadedUrl,
        parent_id: parentId,           /* 본문과 달리 원본 ID 설정 */
        phase:     _getGalleryPhase(),
    }]);

    if (res.error) {
        alert('저장 실패');
    } else {
        if (fileInput.files.length > 0) { event.target.innerText = '기록'; event.target.disabled = false; }
        closeModal('reply-modal');
        loadGalleryData(currentGalleryPage);

        /* 새 답글이 추가됐으니 해당 답글 컨테이너를 자동으로 펼침 */
        setTimeout(function () {
            var repliesDiv = document.getElementById('replies-' + parentId);
            var toggleBtn  = document.querySelector('button[onclick="toggleReplies(' + parentId + ')"]');
            if (repliesDiv && repliesDiv.style.display === 'none') {
                repliesDiv.style.display = 'flex';
                if (toggleBtn) toggleBtn.innerText = toggleBtn.innerText.replace('보기', '닫기');
            }
        }, 500);
    }
};

/*
 * [함수] deleteGalleryPost
 *
 * 게시글 또는 답글을 삭제합니다.
 * HTML 단계에서 본인 글에만 삭제 버튼이 표시되므로
 * UI 레벨에서 권한이 이미 걸러져 있습니다.
 *
 * 매개변수:
 *   postId — 삭제할 게시글 (또는 답글) 의 DB id
 */
window.deleteGalleryPost = async function (postId) {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    var res = await supabaseClient.from('gallery_posts').delete().eq('id', postId);
    if (res.error) alert('삭제 실패');
    else           loadGalleryData(currentGalleryPage);
};


/* ================================================================= */
/* 2. 상점 (아이템 구매 시스템)                                        */
/* ================================================================= */

/*
 * ✏️  아이템 목록 — 이 배열을 수정해서 상점 상품을 바꾸세요.
 *
 * 공통 필드:
 *   name  : 화면에 표시될 아이템 이름
 *   desc  : 설명 문구
 *   price : 가격 (G 단위 정수)
 *   img   : 이미지 URL
 *   type  : 아이템 종류 (아래 참고)
 *
 * type 별 저장 위치:
 *   'item'      → 캐릭터 일반 인벤토리 (inventory 컬럼)
 *   'furniture' → 가구 인벤토리 (furniture_inventory 컬럼)
 *   'wallpaper' → 가구 인벤토리
 *   'floor'     → 가구 인벤토리
 *
 * furniture 추가 필드:
 *   width, height — 방에 배치할 때의 픽셀 크기
 *
 * wallpaper 추가 필드:
 *   colorL — 벽지 왼쪽 색상 (CSS 색상값)
 *   colorR — 벽지 오른쪽 색상
 *   bgImg  — 배경 이미지 URL (선택)
 *
 * floor 추가 필드:
 *   color — 바닥 색상 (CSS 색상값)
 */
window.shopItems = [
    {
        name:  '회복약',
        desc:  'HP 를 소량 회복시켜 주는 붉은 액체.',
        price: 100,
        img:   'https://placehold.co/100x100/1a1a1a/aaaaaa?text=Item',
        type:  'item',
    },
    {
        name:  '방어구',
        desc:  '단단한 철제로 제작된 가슴받이.',
        price: 500,
        img:   'https://placehold.co/100x100/1a1a1a/aaaaaa?text=Item',
        type:  'item',
    },
    {
        name:  '가구 생성권',
        desc:  '나만의 커스텀 가구 / 벽지 / 바닥재를 직접 제작할 수 있습니다.',
        price: 5000,
        img:   'https://placehold.co/100x100/1a1a1a/aaaaaa?text=DIY',
        type:  'item', /* 사용 시 DIY 모달 열림 — index.html 인라인 스크립트 참조 */
    },
    {
        name:  '오래된 소파',
        desc:  '낡았지만 앉으면 편안한 가구.',
        price: 800,
        img:   'https://placehold.co/100x100/1a1a1a/aaaaaa?text=Sofa',
        type:  'furniture',
        width:  120,
        height:  80,
    },
    {
        name:  '무채색 벽지',
        desc:  '담백한 무채색 톤의 벽지.',
        price: 1500,
        img:   'https://placehold.co/100x100/1a1a1a/aaaaaa?text=Wall',
        type:  'wallpaper',
        colorL: '#2a2a2a',
        colorR: '#1a1a1a',
    },
    {
        name:  '원목 바닥재',
        desc:  '따뜻한 느낌의 원목 바닥재.',
        price: 800,
        img:   'https://placehold.co/100x100/1a1a1a/aaaaaa?text=Floor',
        type:  'floor',
        color: '#5a4a3a',
    },
];

/* 상점 페이지네이션 & 탭 상태 */
var SHOP_ITEMS_PER_PAGE = 8;         /* 한 페이지당 아이템 수 */
var currentShopPage     = 1;         /* 현재 페이지 번호 */
var currentShopTab      = 'general'; /* 현재 탭: 'general' | 'furniture' */

/*
 * [함수] changeShopTab
 *
 * 상점 탭(Items / Furniture)을 전환하고 목록을 다시 렌더링합니다.
 *
 * 매개변수:
 *   tab — 'general' 또는 'furniture'
 */
window.changeShopTab = function (tab) {
    currentShopTab  = tab;
    currentShopPage = 1; /* 탭이 바뀌면 첫 페이지로 초기화 */

    var tabs = document.querySelectorAll('#shop-tabs .phase-btn');
    tabs.forEach(function (btn, i) {
        btn.classList.toggle('active', (tab === 'general') ? i === 0 : i === 1);
    });

    window.renderShop();
};

/*
 * [함수] changeShopPage
 * 상점 페이지 이동.
 */
window.changeShopPage = function (page) {
    currentShopPage = page;
    window.renderShop();
};

/*
 * [함수] shopQtyChange
 *
 * +/- 버튼을 눌렀을 때 수량과 합계 금액을 업데이트합니다.
 *
 * 매개변수:
 *   idx   — shopItems 배열의 원본 인덱스
 *   delta — +1(증가) 또는 -1(감소)
 */
window.shopQtyChange = function (idx, delta) {
    var el      = document.getElementById('shop-qty-'   + idx);
    var totalEl = document.getElementById('shop-total-' + idx);
    if (!el) return;

    var qty = Math.max(1, Math.min(parseInt(el.innerText) + delta, 10)); /* 1 ~ 10 범위 */
    el.innerText = qty;
    if (totalEl) totalEl.innerText = (window.shopItems[idx].price * qty).toLocaleString() + ' G';
};

/*
 * [함수] updateShopMoneyDisplay
 *
 * DB 에서 내 캐릭터의 소지금을 조회해 상점 화면 상단에 표시합니다.
 * 상점 탭 열기, 구매 완료 후에 호출됩니다.
 */
window.updateShopMoneyDisplay = async function () {
    var display = document.getElementById('shop-my-money');
    if (!display) return;
    if (!currentUser)                   { display.innerText = '로그인 필요'; return; }
    var myCharId = charOwners[currentUser.email];
    if (!myCharId)                      { display.innerText = '권한 없음';  return; }

    /* character_profiles 에서 phase=0(1부) 기준 소지금 조회 */
    var res = await supabaseClient
        .from('character_profiles').select('money')
        .eq('char_id', myCharId).eq('phase', 0).single();
    display.innerText = ((res.data && res.data.money)
        ? parseInt(res.data.money) : 0).toLocaleString() + ' G';
};

/*
 * [함수] renderShop
 *
 * 현재 탭 / 페이지에 맞는 상품 카드를 렌더링합니다.
 * 탭 전환, 페이지 이동, 최초 로드 시 호출됩니다.
 *
 * originalIndex 를 함께 보관하는 이유:
 *   필터 후 인덱스가 재정렬되면 shopQtyChange / buyItem 에 넘기는
 *   idx 가 shopItems 원본 배열 위치와 달라집니다.
 *   원본 인덱스를 함께 저장해야 수량 UI 가 정확하게 연결됩니다.
 */
window.renderShop = function () {
    var container = document.getElementById('shop-items-container');
    if (!container) return;

    var filtered = window.shopItems
        .map(function (item, originalIndex) {
            return { item: item, originalIndex: originalIndex };
        })
        .filter(function (d) {
            var isFurn = (d.item.type === 'furniture' || d.item.type === 'wallpaper' || d.item.type === 'floor');
            if (currentShopTab === 'general'   &&  isFurn) return false;
            if (currentShopTab === 'furniture' && !isFurn) return false;
            return true;
        });

    var totalPages = Math.ceil(filtered.length / SHOP_ITEMS_PER_PAGE);
    if (currentShopPage > totalPages && totalPages > 0) currentShopPage = totalPages;

    var pageItems = filtered.slice(
        (currentShopPage - 1) * SHOP_ITEMS_PER_PAGE,
        currentShopPage * SHOP_ITEMS_PER_PAGE
    );

    container.innerHTML = pageItems.map(function (d) {
        var item = d.item, idx = d.originalIndex;
        return '<div class="shop-item-card">' +
            '<img src="' + item.img + '" class="shop-item-img">' +
            '<div class="shop-item-title">' + item.name + '</div>' +
            '<div class="shop-item-desc">'  + item.desc  + '</div>' +
            '<div class="shop-item-price">' + item.price.toLocaleString() + ' G</div>' +
            '<div class="shop-qty-control">' +
                '<button class="shop-qty-btn" onclick="shopQtyChange(' + idx + ',-1)">-</button>' +
                '<span id="shop-qty-' + idx + '" class="shop-qty-val">1</span>' +
                '<button class="shop-qty-btn" onclick="shopQtyChange(' + idx + ',1)">+</button>' +
            '</div>' +
            '<div class="shop-total-price" id="shop-total-' + idx + '" ' +
                'style="text-align:center;color:#ccc;font-size:0.85rem;margin-bottom:10px;">' +
                item.price.toLocaleString() + ' G</div>' +
            '<button class="btn-buy" onclick="buyItem(' + idx + ', this)">구매하기</button>' +
        '</div>';
    }).join('');

    /* 페이지네이션 버튼 컨테이너 — 없으면 생성, 있으면 내용만 교체 */
    var pageEl = document.getElementById('shop-pagination-container');
    if (!pageEl) {
        pageEl    = document.createElement('div');
        pageEl.id = 'shop-pagination-container';
        pageEl.style.cssText = 'display:flex;justify-content:center;gap:10px;margin-top:25px;width:100%;';
        container.parentNode.insertBefore(pageEl, container.nextSibling);
    }
    pageEl.innerHTML = totalPages > 1
        ? (function () {
            var s = '';
            for (var i = 1; i <= totalPages; i++) {
                s += '<button class="shop-page-btn ' + (i === currentShopPage ? 'active' : '') +
                     '" onclick="changeShopPage(' + i + ')">' + i + '</button>';
            }
            return s;
          }())
        : '';
};

/*
 * [함수] buyItem
 *
 * 상품을 구매합니다.
 * 소지금 확인 → 차감 → 인벤토리 입고 → DB 저장까지 처리합니다.
 *
 * 매개변수:
 *   idx — shopItems 배열의 원본 인덱스
 *   btn — 클릭된 '구매하기' 버튼 요소 (처리 중 비활성화 용)
 *
 * 처리 순서:
 *   1. 로그인 / 권한 확인
 *   2. 선택 수량 읽기
 *   3. 소지금 사전 확인 (잔액 부족 시 조기 종료)
 *   4. 최신 프로필(소지금 + 인벤토리) 재조회 — confirm 누르는 사이 변경 방지
 *   5. 소지금 차감
 *   6. 인벤토리 빈 슬롯 탐색 → 있으면 인벤토리, 없으면 우편함으로
 *   7. DB 업데이트
 *   8. 결과 알림 및 UI 초기화
 *
 * 주의:
 *   소지금이 콤마 포함 문자열('1,000')로 저장될 수 있어 replace(/,/g, '') 처리합니다.
 *   가구류(furniture / wallpaper / floor)는 furniture_inventory 컬럼에 저장합니다.
 */
window.buyItem = async function (idx, btn) {
    if (!currentUser) return alert('로그인이 필요합니다.');
    var myCharId = charOwners[currentUser.email];
    if (!myCharId) return alert('캐릭터 권한이 없습니다.');

    var item = window.shopItems[idx];
    if (!item) return;

    var qtyEl     = document.getElementById('shop-qty-' + idx);
    var qty       = parseInt((qtyEl && qtyEl.innerText) || '1', 10);
    var totalCost = item.price * qty;
    var originalText = btn.innerText;

    /* 1차 소지금 사전 확인 */
    var checkRes = await supabaseClient
        .from('character_profiles').select('money')
        .eq('char_id', myCharId).eq('phase', 0).single();
    var checkMoney = (checkRes.data && checkRes.data.money)
        ? parseInt(String(checkRes.data.money).replace(/,/g, ''), 10) : 0;

    if (checkMoney < totalCost)
        return alert('소지금이 부족합니다.\n필요: ' + totalCost.toLocaleString() +
                     ' G / 보유: ' + checkMoney.toLocaleString() + ' G');
    if (!confirm('[' + item.name + '] x ' + qty + '개\n총 ' + totalCost.toLocaleString() + ' G 결제하시겠습니까?'))
        return;

    btn.innerText = '결제중...'; btn.disabled = true;

    try {
        /* 최신 인벤토리 & 소지금 재조회 */
        var fetchRes = await supabaseClient
            .from('character_profiles')
            .select('money, inventory, furniture_inventory, mailbox')
            .eq('char_id', myCharId).eq('phase', 0).single();
        if (fetchRes.error) throw fetchRes.error;

        var profile = fetchRes.data;
        var money   = (profile && profile.money)
            ? parseInt(String(profile.money).replace(/,/g, ''), 10) : 0;

        /* 가구류는 furniture_inventory, 나머지는 inventory 컬럼 */
        var isFurnitureType = (item.type === 'furniture' || item.type === 'wallpaper' || item.type === 'floor');
        var targetCol       = isFurnitureType ? 'furniture_inventory' : 'inventory';

        /* 인벤토리 파싱 (DB 는 JSON 문자열 또는 배열로 저장됨) */
        var targetArr = [];
        var rawInv    = (profile && profile[targetCol]) || '';
        if (typeof rawInv === 'string' && rawInv.trim() !== '') {
            try { targetArr = JSON.parse(rawInv); } catch(e) { targetArr = []; }
        } else if (Array.isArray(rawInv)) {
            targetArr = rawInv.slice();
        }
        while (targetArr.length < 20) targetArr.push(null); /* 인벤토리는 항상 20칸 유지 */

        /* 우편함 파싱 */
        var mailArr = [];
        if (profile && profile.mailbox) {
            try {
                mailArr = typeof profile.mailbox === 'string'
                    ? JSON.parse(profile.mailbox) : profile.mailbox;
            } catch(e) { mailArr = []; }
        }
        if (!Array.isArray(mailArr)) mailArr = [];

        money -= totalCost;

        var inInv = 0, inMail = 0;

        /* 같은 이름 아이템이 있으면 수량만 증가 */
        var existing = null;
        for (var i = 0; i < targetArr.length; i++) {
            if (targetArr[i] && targetArr[i].name === item.name) { existing = targetArr[i]; break; }
        }

        if (existing) {
            existing.count = (existing.count || 1) + qty;
            inInv += qty;
        } else {
            /* 빈 슬롯 탐색 */
            var emptyIdx = -1;
            for (var j = 0; j < targetArr.length; j++) {
                if (targetArr[j] === null || targetArr[j] === '') { emptyIdx = j; break; }
            }

            /* 아이템 객체 생성 */
            var newObj = {
                name:  item.name,
                desc:  item.desc  || '',
                img:   item.img   || '',
                type:  item.type  || 'item',
                count: qty
            };
            /* 타입별 추가 필드 복사 */
            if (item.type === 'wallpaper') {
                if (item.colorL) newObj.colorL = item.colorL;
                if (item.colorR) newObj.colorR = item.colorR;
                if (item.bgImg)  newObj.bgImg  = item.bgImg;
            }
            if (item.type === 'furniture') {
                if (item.width)  newObj.width  = item.width;
                if (item.height) newObj.height = item.height;
            }
            if (item.type === 'floor' && item.color) newObj.color = item.color;

            /* 빈 슬롯 있으면 인벤토리, 없으면 우편함 */
            if (emptyIdx !== -1) { targetArr[emptyIdx] = newObj; inInv  += qty; }
            else                 { mailArr.push(newObj);          inMail += qty; }
        }

        var updatePayload        = { money: money };
        updatePayload[targetCol] = targetArr;
        if (inMail > 0) updatePayload.mailbox = mailArr;

        currentEditingId    = myCharId;
        currentEditingPhase = 0;
        var upsertRes = await upsertProfileData(updatePayload); /* Auth.js 에 정의 */
        if (upsertRes && upsertRes.error) throw upsertRes.error;

        var msg = '[' + item.name + '] ' + qty + '개 구매 완료!\n잔액: ' + money.toLocaleString() + ' G';
        if (inMail > 0) msg += '\n(가방 공간 부족 — 우편함으로 발송됨)';
        alert(msg);

        if (qtyEl) qtyEl.innerText = '1';
        var totalEl = document.getElementById('shop-total-' + idx);
        if (totalEl) totalEl.innerText = item.price.toLocaleString() + ' G';

        if (typeof window.updateShopMoneyDisplay === 'function') await window.updateShopMoneyDisplay();
        if (typeof loadCharacterData             === 'function') await loadCharacterData();

    } catch (err) {
        console.error('구매 에러:', err);
        alert('결제 오류 발생. (F12 콘솔 확인)');
    } finally {
        btn.innerText = originalText; btn.disabled = false;
    }
};


/* ================================================================= */
/* 3. 캘린더 (월별 일정 관리)                                          */
/* ================================================================= */

/*
 * [함수] buildCalendar
 *
 * 사이드바의 캘린더를 초기화하고 렌더링합니다.
 * window.load 이벤트에서 한 번만 호출됩니다.
 *
 * 내부의 render() 함수를 정의해 월 이동 시 재사용합니다.
 * DB(calendar_events)에서 이벤트를 조회해 해당 날짜에 툴팁을 붙입니다.
 *
 * 전역 노출 함수:
 *   prevMonth()   — 이전 달 이동
 *   nextMonth()   — 다음 달 이동
 *   addEvent()    — 날짜 클릭 (이벤트 없으면 추가, 있으면 삭제 확인)
 *   deleteEvent() — 이벤트 삭제
 */
async function buildCalendar() {
    var el = document.getElementById('calendar');
    if (!el) return;

    var current = new Date(); /* 현재 표시 중인 연월 — 월 이동 시 변경됨 */

    async function render() {
        var res    = await supabaseClient.from('calendar_events').select('*');
        var events = {};
        if (res.data) {
            /* 'YYYY-MM-DD' 를 키로 사용 */
            res.data.forEach(function (d) { events[d.event_date] = [d.title, d.description]; });
        }

        var y  = current.getFullYear();
        var m  = current.getMonth();     /* 0~11 */
        var td = new Date();             /* 오늘 (today 클래스 적용용) */
        var fd = new Date(y, m, 1).getDay();      /* 이번 달 1일 요일 (0=일) */
        var ld = new Date(y, m + 1, 0).getDate(); /* 이번 달 마지막 날 */

        var cells = '';

        /* 1일 이전 빈 칸 */
        for (var i = 0; i < fd; i++) cells += '<div class="cal-day empty"></div>';

        /* 날짜 칸 생성 */
        for (var d = 1; d <= ld; d++) {
            var ds = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
            var ev = events[ds];

            var isToday = (d === td.getDate() && m === td.getMonth() && y === td.getFullYear());

            cells +=
                '<div class="cal-day' +
                    (isToday ? ' today' : '') +
                    (ev      ? ' has-event' : '') + '"' +
                    ' onclick="addEvent(\'' + ds + '\', ' + !!ev + ')">' +
                    d +
                    (ev
                        ? '<div class="cal-tooltip"><strong>' + ev[0] + '</strong><br>' + ev[1] + '</div>'
                        : '') +
                '</div>';
        }

        el.innerHTML =
            '<div class="cal-header">' +
                '<div>' + y + '</div>' +
                '<div class="cal-nav">' +
                    '<button onclick="prevMonth()">&lt;</button>' +
                    '<span>' + (m + 1) + '月</span>' +
                    '<button onclick="nextMonth()">&gt;</button>' +
                '</div>' +
            '</div>' +
            '<div class="cal-grid">' +
                ['일','월','화','수','목','금','토'].map(function (d) {
                    return '<div class="cal-dow">' + d + '</div>';
                }).join('') +
                cells +
            '</div>';
    }

    window.prevMonth = function () {
        current = new Date(current.getFullYear(), current.getMonth() - 1, 1);
        render();
    };
    window.nextMonth = function () {
        current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
        render();
    };

    /*
     * 날짜 칸 클릭
     *   hasEvent = true  → 이미 이벤트 있는 날 → 삭제 여부 확인
     *   hasEvent = false → 빈 날 → 제목 / 내용 입력 후 추가
     */
    window.addEvent = async function (dateStr, hasEvent) {
        if (hasEvent) { await window.deleteEvent(dateStr); return; }
        var title = prompt('일정 제목:');
        if (!title) return;
        var desc = prompt('일정 내용:');
        var res  = await supabaseClient.from('calendar_events')
            .insert([{ event_date: dateStr, title: title, description: desc || ' ' }]);
        if (res.error) alert('저장 실패');
        else           buildCalendar();
    };

    window.deleteEvent = async function (dateStr) {
        if (!confirm('일정을 삭제하시겠습니까?')) return;
        var res = await supabaseClient.from('calendar_events').delete().eq('event_date', dateStr);
        if (res.error) alert('삭제 실패');
        else           buildCalendar();
    };

    render();
}


/* ================================================================= */
/* 4. 미니게임 (동전 던지기 / 야바위 / 사냥터 / 낚시)                  */
/* ================================================================= */

/*
 * [헬퍼] _getLatestMoney
 *
 * DB 에서 지정한 캐릭터의 최신 소지금을 가져옵니다.
 * 배팅 확인 / 보상 지급 직전에 항상 이 함수로 최신값을 읽습니다.
 * (전역 currentMoney 는 UI 표시용으로 실제 DB 값과 차이가 날 수 있음)
 *
 * 매개변수:
 *   charId — 조회할 캐릭터 ID (예: 'char-p1')
 *
 * 반환값: 소지금 정수 (0 이상), 조회 실패 시 0
 */
async function _getLatestMoney(charId) {
    if (!supabaseClient || !charId) return 0;
    var res = await supabaseClient
        .from('character_profiles').select('money')
        .eq('char_id', charId).eq('phase', 0).single();
    if (res.data && res.data.money) {
        return parseInt(String(res.data.money).replace(/,/g, ''), 10) || 0;
    }
    return 0;
}

/*
 * [함수] changeMiniGame
 *
 * 미니게임 탭을 전환합니다.
 * 야바위 탭(idx=1)으로 이동할 때는 컵 위치를 초기화합니다.
 *
 * 매개변수:
 *   btn — 클릭된 탭 버튼 요소
 *   idx — 표시할 슬라이드 인덱스 (0=동전, 1=야바위, 2=사냥, 3=낚시)
 */
window.changeMiniGame = function (btn, idx) {
    var sec = document.getElementById('MiniGames');
    sec.querySelectorAll('.phase-btn').forEach(function (t) { t.classList.remove('active'); });
    sec.querySelectorAll('.mg-slide').forEach(function (s)  { s.classList.remove('active'); });
    btn.classList.add('active');
    sec.querySelectorAll('.mg-slide')[idx].classList.add('active');

    if (idx === 1) initShellPositions();
    _refreshMiniGameMoneyDisplay();
};

/*
 * [함수] _refreshMiniGameMoneyDisplay
 *
 * DB 에서 최신 소지금을 읽어 미니게임 화면의 잔액 표시를 갱신합니다.
 * 탭 전환 시, 게임 결과 처리 후에 호출됩니다.
 */
async function _refreshMiniGameMoneyDisplay() {
    if (!currentUser) return;
    var myCharId = charOwners[currentUser.email];
    if (!myCharId) return;
    var money = await _getLatestMoney(myCharId);
    window.currentMoney = money;
    var el = document.getElementById('minigame-my-money');
    if (el) el.innerText = money.toLocaleString() + ' G';
}
window.updateMiniGameMoneyDisplay = _refreshMiniGameMoneyDisplay;


/* ── 동전 던지기 ─────────────────────────────────────────────────── */

var isTossing = false; /* 동전 돌아가는 중 중복 클릭 방지 */

/*
 * [함수] playCoinToss
 *
 * 동전 던지기 게임을 실행합니다.
 * 앞 / 뒤를 맞추면 배팅액을 얻고, 틀리면 잃습니다.
 *
 * 매개변수:
 *   guess — 'heads'(앞면) 또는 'tails'(뒷면)
 *
 * 처리 순서:
 *   1. 로그인 / 권한 / 배팅액 확인
 *   2. DB 에서 최신 소지금 확인 (잔액 부족 시 종료)
 *   3. 동전 회전 애니메이션 시작 (1.5초)
 *   4. 1.5초 후: 결과 결정 → 소지금 갱신 → DB 저장 → UI 업데이트
 */
window.playCoinToss = async function (guess) {
    if (isTossing) return;
    if (!currentUser) return alert('로그인이 필요합니다.');
    var myCharId = charOwners[currentUser.email];
    if (!myCharId) return alert('권한이 없습니다.');

    var bet = parseInt(document.getElementById('cointoss-bet').value);
    if (isNaN(bet) || bet <= 0) return alert('판돈을 1 G 이상 걸어주세요.');

    var dbMoney = await _getLatestMoney(myCharId);
    if (bet > dbMoney) return alert('소지금이 부족합니다.\n현재 소지금: ' + dbMoney.toLocaleString() + ' G');

    isTossing = true;

    var coin       = document.getElementById('coin-element');
    var resultText = document.getElementById('cointoss-result');
    document.getElementById('btn-guess-heads').disabled = true;
    document.getElementById('btn-guess-tails').disabled = true;
    resultText.innerText   = '동전이 돌아갑니다...';
    resultText.style.color = '#aaa';
    coin.innerText = '';
    coin.classList.remove('coin-flipping');
    void coin.offsetWidth;          /* 리플로우 강제 → 애니메이션 재시작 */
    coin.classList.add('coin-flipping');

    setTimeout(async function () {
        try {
            /* 앞 / 뒷면 무작위 결정 (50:50) */
            var outcome = Math.random() < 0.5 ? 'heads' : 'tails';
            coin.innerText = outcome === 'heads' ? '앞' : '뒤';
            coin.className = outcome === 'heads' ? 'coin' : 'coin silver';

            /* 애니메이션 도중 다른 탭에서 소지금이 변경됐을 수 있어 재조회 */
            var freshMoney = await _getLatestMoney(myCharId);

            if (guess === outcome) {
                freshMoney           += bet;
                resultText.innerText   = '적중. ' + bet.toLocaleString() + ' G 획득';
                resultText.style.color = '#cccccc';
            } else {
                freshMoney           -= bet;
                resultText.innerText   = '실패. ' + bet.toLocaleString() + ' G 손실';
                resultText.style.color = '#666666';
            }

            currentEditingId    = myCharId;
            currentEditingPhase = 0;
            var res = await upsertProfileData({ money: freshMoney });
            if (res && res.error) {
                alert('결과 저장 실패');
            } else {
                currentMoney = freshMoney;
                await _refreshMiniGameMoneyDisplay();
                if (typeof loadCharacterData === 'function') await loadCharacterData();
            }
        } finally {
            /* 오류가 나도 버튼은 반드시 다시 활성화 */
            isTossing = false;
            document.getElementById('btn-guess-heads').disabled = false;
            document.getElementById('btn-guess-tails').disabled = false;
            coin.classList.remove('coin-flipping');
        }
    }, 1500);
};


/* ── 야바위 ─────────────────────────────────────────────────────── */

/*
 * 야바위 상태 변수
 *   shellState      — 진행 단계: 'idle' | 'shuffling' | 'waiting' | 'resolving'
 *   shellWinningCup — 공이 있는 컵 인덱스 (0, 1, 2)
 *   shellBetAmount  — 이번 게임 배팅액
 *   cupPositions    — 각 컵 래퍼의 현재 논리 위치 배열 [0,1,2]
 *   CUP_X           — 각 위치의 픽셀 X 좌표 (initShellPositions 로 계산)
 */
var shellState      = 'idle';
var shellWinningCup = -1;
var shellBetAmount  = 0;
var cupPositions    = [0, 1, 2];
var CUP_X           = [0, 120, 240];

/*
 * [함수] initShellPositions
 *
 * 야바위 컵의 초기 위치를 계산하고 적용합니다.
 * 보드 너비와 컵 너비를 기준으로 균등 배치합니다.
 * 창 크기가 바뀔 때도 자동 재계산됩니다.
 */
function initShellPositions() {
    var board = document.getElementById('shell-board');
    if (!board) return;
    var cw   = board.clientWidth;
    var cupW = (document.getElementById('cup-wrap-0') || {}).clientWidth || 80;
    var gap  = (cw - cupW * 3) / 2; /* 균등 배치 간격 */
    CUP_X        = [0, cupW + gap, (cupW + gap) * 2];
    cupPositions = [0, 1, 2];
    [0, 1, 2].forEach(function (i) {
        var el = document.getElementById('cup-wrap-' + i);
        if (el) el.style.transform = 'translate(' + CUP_X[i] + 'px, 0px)';
    });
}
window.addEventListener('resize', initShellPositions);

/*
 * [함수] startShellGame
 *
 * 야바위 게임을 시작합니다.
 *
 * 처리 순서:
 *   1. 상태 / 로그인 / 배팅액 / 소지금 확인
 *   2. 공이 들어갈 컵 무작위 선택 후 1.2초 공개
 *   3. 컵 25회 셔플 (처음엔 느리게, 점점 빠르게)
 *   4. shellState = 'waiting' → 플레이어 선택 대기
 */
window.startShellGame = async function () {
    if (shellState !== 'idle') return;
    if (!currentUser) return alert('로그인이 필요합니다.');
    var myCharId = charOwners[currentUser.email];
    if (!myCharId) return alert('권한이 없습니다.');

    var bet = parseInt(document.getElementById('shell-bet').value);
    if (isNaN(bet) || bet <= 0) return alert('판돈을 1 G 이상 걸어주세요.');

    var dbMoney = await _getLatestMoney(myCharId);
    if (bet > dbMoney) return alert('소지금이 부족합니다.\n현재 소지금: ' + dbMoney.toLocaleString() + ' G');

    shellBetAmount = bet;
    shellState     = 'shuffling';

    var resultText = document.getElementById('shell-result');
    var cups       = document.querySelectorAll('.shell-cup');
    var balls      = document.querySelectorAll('.shell-ball');
    var wrappers   = [0, 1, 2].map(function (i) { return document.getElementById('cup-wrap-' + i); });

    cups.forEach(function (c)  { c.classList.remove('revealed'); });
    balls.forEach(function (b) { b.classList.remove('winner');   });

    shellWinningCup = Math.floor(Math.random() * 3);
    document.getElementById('shell-ball-' + shellWinningCup).classList.add('winner');

    /* 1.2초 동안 공 위치 공개 */
    resultText.innerText   = '공을 잘 보세요.';
    resultText.style.color = '#aaa';
    document.getElementById('cup-' + shellWinningCup).classList.add('revealed');
    await new Promise(function (r) { setTimeout(r, 1200); });
    document.getElementById('cup-' + shellWinningCup).classList.remove('revealed');
    await new Promise(function (r) { setTimeout(r, 600); });

    resultText.innerText   = '섞는 중...';
    resultText.style.color = '#888';

    /* 셔플 애니메이션 — 25회, 갈수록 빠르게 */
    var shuffleCount = 25, speed = 350;
    for (var i = 0; i < shuffleCount; i++) {
        if (i > 5)  speed = 200;
        if (i > 10) speed = 120;
        if (i > 15) speed = 70;
        wrappers.forEach(function (w) {
            w.style.transition = 'transform ' + speed + 'ms ease-in-out';
        });

        /* 무작위 두 위치 선택 후 교환 */
        var posA = Math.floor(Math.random() * 3);
        var posB = Math.floor(Math.random() * 3);
        while (posA === posB) posB = Math.floor(Math.random() * 3);

        var cupIdxA = cupPositions.indexOf(posA);
        var cupIdxB = cupPositions.indexOf(posB);
        cupPositions[cupIdxA] = posB;
        cupPositions[cupIdxB] = posA;

        /* 위로 들었다가 이동하는 애니메이션 */
        wrappers[cupIdxA].style.zIndex    = 10;
        wrappers[cupIdxB].style.zIndex    = 5;
        wrappers[cupIdxA].style.transform = 'translate(' + CUP_X[posB] + 'px, -20px)';
        wrappers[cupIdxB].style.transform = 'translate(' + CUP_X[posA] + 'px, 20px)';
        await new Promise(function (r) { setTimeout(r, speed / 2); });
        wrappers[cupIdxA].style.transform = 'translate(' + CUP_X[posB] + 'px, 0px)';
        wrappers[cupIdxB].style.transform = 'translate(' + CUP_X[posA] + 'px, 0px)';
        await new Promise(function (r) { setTimeout(r, speed / 2 + 10); });
    }

    wrappers.forEach(function (w, idx) {
        w.style.transition = 'transform 300ms ease';
        w.style.transform  = 'translate(' + CUP_X[cupPositions[idx]] + 'px, 0px)';
        w.style.zIndex     = 1;
    });
    await new Promise(function (r) { setTimeout(r, 300); });

    resultText.innerText   = '공이 있는 컵을 선택하세요.';
    resultText.style.color = '#aaa';
    shellState = 'waiting';
};

/*
 * [함수] guessShellCup
 *
 * 플레이어가 컵을 선택했을 때 호출됩니다.
 * 모든 컵을 뒤집어 결과를 공개하고 소지금을 갱신합니다.
 * 정답이면 배팅액의 3배를 지급합니다.
 *
 * 매개변수:
 *   selectedCupIdx — 플레이어가 선택한 컵 인덱스 (0, 1, 2)
 */
window.guessShellCup = async function (selectedCupIdx) {
    if (shellState !== 'waiting') return;
    shellState = 'resolving';

    var myCharId   = charOwners[currentUser.email];
    var resultText = document.getElementById('shell-result');
    var cups       = document.querySelectorAll('.shell-cup');
    cups.forEach(function (c) { c.classList.add('revealed'); });

    var dbMoney = await _getLatestMoney(myCharId);
    dbMoney -= shellBetAmount; /* 배팅액 차감 */

    if (selectedCupIdx === shellWinningCup) {
        var winAmount = shellBetAmount * 3; /* 정답: 3배 지급 */
        dbMoney += winAmount;
        resultText.innerText   = '정답. ' + winAmount.toLocaleString() + ' G 획득';
        resultText.style.color = '#cccccc';
    } else {
        resultText.innerText   = '꽝. 다시 도전하세요.';
        resultText.style.color = '#555555';
    }

    currentEditingId    = myCharId;
    currentEditingPhase = 0;
    await upsertProfileData({ money: dbMoney });
    currentMoney = dbMoney;
    await _refreshMiniGameMoneyDisplay();
    if (typeof loadCharacterData === 'function') await loadCharacterData();

    /* 3초 후 초기화 */
    setTimeout(function () {
        shellState             = 'idle';
        resultText.innerText   = '베팅 후 게임을 시작하세요.';
        resultText.style.color = '#666';
        cups.forEach(function (c) { c.classList.remove('revealed'); });
    }, 3000);
};


/* ── 사냥터 ──────────────────────────────────────────────────────── */

var huntScore         = 0;
var huntMoneyEarned   = 0;
var huntTimer         = 0;
var huntInterval      = null;
var huntSpawnInterval = null;

/*
 * [함수] startHuntingGame
 *
 * 사냥터 게임을 시작합니다.
 * ✏️  게임 시간을 바꾸려면 huntTimer = 15 의 숫자를 수정하세요.
 *
 * 처리 순서:
 *   1. 로그인 / 권한 확인
 *   2. 기존 인터벌 정리 (재시작 대비)
 *   3. 변수 / UI 초기화
 *   4. 1초마다 타이머 감소 → 0 이 되면 endHuntingGame() 호출
 *   5. 0.7초마다 사냥감 생성 (최초 0.2초 후 첫 생성)
 */
window.startHuntingGame = function () {
    if (!currentUser) return alert('로그인이 필요합니다.');
    var myCharId = charOwners[currentUser.email];
    if (!myCharId) return alert('캐릭터 권한이 없습니다.');

    if (huntInterval)      clearInterval(huntInterval);
    if (huntSpawnInterval) clearInterval(huntSpawnInterval);

    var btn  = document.getElementById('btn-start-hunt');
    var area = document.getElementById('hunt-area');

    btn.disabled  = true;
    btn.innerText = '사냥 진행 중...';

    huntScore       = 0;
    huntMoneyEarned = 0;
    huntTimer       = 15; /* ✏️  게임 시간(초) */

    document.getElementById('hunt-score').innerText = huntMoneyEarned;
    document.getElementById('hunt-timer').innerText = huntTimer;
    area.innerHTML = '';
    void area.offsetWidth;

    huntInterval = setInterval(function () {
        huntTimer--;
        document.getElementById('hunt-timer').innerText = huntTimer;
        if (huntTimer <= 0) endHuntingGame(myCharId);
    }, 1000);

    setTimeout(function () {
        if (huntTimer > 0) spawnTarget(area);
        huntSpawnInterval = setInterval(function () {
            if (huntTimer > 0) spawnTarget(area);
        }, 700);
    }, 200);
};

/*
 * [함수] spawnTarget
 *
 * 사냥감을 사냥터 영역 안 무작위 위치에 생성합니다.
 * 클릭하면 보상을 획득하고, 일정 시간이 지나면 자동으로 사라집니다.
 *
 * ✏️  보상과 출현 확률 조절:
 *   isBear  : Math.random() < 0.2  → 20% 확률로 곰 출현
 *   reward  : 사슴 10G, 곰 50G
 *   lifeMs  : 사냥감이 화면에 머무는 시간 (ms)
 *
 * 매개변수:
 *   area — 사냥터 div 요소
 */
function spawnTarget(area) {
    if (huntTimer <= 0) return;

    var isBear = Math.random() < 0.2; /* ✏️  20% 확률로 곰 */
    var size   = isBear ? 84 : 64;
    var reward = isBear ? 50 : 10;   /* ✏️  곰: 50G, 사슴: 10G */
    var label  = isBear ? '곰' : '사슴'; /* 이모지 배제 */
    var lifeMs = isBear ? 1400 : 1100;

    var areaW = area.clientWidth, areaH = area.clientHeight;
    if (areaW === 0 || areaH === 0) {
        var rect = area.getBoundingClientRect();
        areaW = rect.width  || 800;
        areaH = rect.height || 380;
    }

    var target       = document.createElement('div');
    target.className = 'hunt-target ' + (isBear ? 'bear' : 'deer');
    target.textContent = label;
    target.style.left  = (10 + Math.floor(Math.random() * Math.max(10, areaW - size - 10))) + 'px';
    target.style.top   = (10 + Math.floor(Math.random() * Math.max(10, areaH - size - 10))) + 'px';

    target.onclick = function () {
        if (target.classList.contains('hit')) return;
        target.classList.add('hit');
        target.textContent  = '+' + reward + 'G';
        huntScore++;
        huntMoneyEarned += reward;
        document.getElementById('hunt-score').innerText = huntMoneyEarned;
        setTimeout(function () { if (area.contains(target)) target.remove(); }, 400);
    };

    area.appendChild(target);
    setTimeout(function () {
        if (area.contains(target) && !target.classList.contains('hit')) target.remove();
    }, lifeMs);
}

/*
 * [함수] endHuntingGame
 *
 * 사냥 게임을 종료하고 보상을 DB 에 저장합니다.
 *
 * 매개변수:
 *   myCharId — 보상을 지급할 캐릭터 ID
 */
async function endHuntingGame(myCharId) {
    clearInterval(huntInterval);
    clearInterval(huntSpawnInterval);
    huntInterval = null; huntSpawnInterval = null;

    var area = document.getElementById('hunt-area');
    area.innerHTML =
        '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
        'color:#aaa;font-size:1.3rem;font-weight:bold;' +
        'background:rgba(0,0,0,0.75);padding:10px 20px;border-radius:8px;">사냥 종료</div>';

    var btn = document.getElementById('btn-start-hunt');
    alert('사냥 종료\n총 ' + huntScore + '마리 -> ' + huntMoneyEarned.toLocaleString() + ' G 획득');

    if (huntMoneyEarned > 0) {
        btn.innerText = '보상 획득 중...';
        var dbMoney   = await _getLatestMoney(myCharId);
        currentEditingId    = myCharId;
        currentEditingPhase = 0;
        var res = await upsertProfileData({ money: dbMoney + huntMoneyEarned });
        if (!res || !res.error) {
            currentMoney = dbMoney + huntMoneyEarned;
            await _refreshMiniGameMoneyDisplay();
            if (typeof loadCharacterData === 'function') await loadCharacterData();
        }
    }

    btn.innerText = '다시 시작';
    btn.disabled  = false;
}


/* ── 낚시 ───────────────────────────────────────────────────────── */

/*
 * 낚시 게임 상태 변수
 *
 *   fishingActive         — 게임 진행 중 여부
 *   fishingFishY          — 물고기(초록 박스) 현재 Y 위치 (bottom 기준, px)
 *   fishingFishSpeed      — 물고기 이동 속도 (양수: 위, 음수: 아래)
 *   fishingPlayerY        — 포획 바 현재 Y 위치 (bottom 기준, px)
 *   fishingPlayerVelocity — 포획 바 속도 (버튼 누름: 위, 뗌: 아래)
 *   fishingProgress       — 포획 게이지 0~100 (100=성공, 0=실패)
 *   isPressingFishingBtn  — 낚시 버튼을 누르고 있는지 여부
 *   fishingAnimationFrame — requestAnimationFrame 핸들 (취소에 사용)
 *
 *   WATER_HEIGHT       — 물 영역 높이 (px)
 *   FISH_HEIGHT        — 물고기 박스 높이 (px)
 *   PLAYER_HEIGHT      — 포획 바 높이 (px, 난이도에 따라 변경)
 *   currentDifficulty  — 현재 난이도: 'easy' | 'hard'
 *   currentFishSpeedBase — 물고기 최대 속도 (난이도에 따라 변경)
 */
var fishingActive          = false;
var fishingFishY           = 120;
var fishingFishSpeed       = 0;
var fishingPlayerY         = 0;
var fishingPlayerVelocity  = 0;
var fishingProgress        = 20;
var isPressingFishingBtn   = false;
var fishingAnimationFrame;

var WATER_HEIGHT        = 300;
var FISH_HEIGHT         = 35;
var PLAYER_HEIGHT       = 100;
var currentDifficulty   = 'easy';
var currentFishSpeedBase = 12;

/* 낚시 버튼 마우스 / 터치 이벤트 */
window.pressFishingBtn  = function (e) {
    if (fishingActive) { e.preventDefault(); isPressingFishingBtn = true;  }
};
window.releaseFishingBtn = function (e) {
    if (fishingActive) { e.preventDefault(); isPressingFishingBtn = false; }
};

/*
 * [함수] prepareFishing
 *
 * 낚시터 선택 버튼을 눌렀을 때 호출됩니다.
 * 난이도에 따라 포획 바 크기와 물고기 속도를 설정한 뒤 게임을 시작합니다.
 *
 * ✏️  보상 범위는 endFishingGame() 의 minReward / maxReward 를 수정하세요.
 *
 * 매개변수:
 *   difficulty — 'easy'(쉬움) 또는 'hard'(어려움)
 *
 *   easy: PLAYER_HEIGHT=100, 물고기 속도=10 (넓은 포획 바, 느린 물고기)
 *   hard: PLAYER_HEIGHT=60,  물고기 속도=22 (좁은 포획 바, 빠른 물고기)
 */
window.prepareFishing = function (difficulty) {
    if (!currentUser) return alert('로그인이 필요합니다.');
    var myCharId = charOwners[currentUser.email];
    if (!myCharId) return alert('캐릭터 권한이 없습니다.');

    currentDifficulty = difficulty;
    var waterArea = document.getElementById('fishing-water-area');
    var playerBar = document.getElementById('player-bar');

    if (difficulty === 'easy') {
        PLAYER_HEIGHT        = 100; /* ✏️  쉬움 포획 바 높이 */
        currentFishSpeedBase = 10;  /* ✏️  쉬움 물고기 최대 속도 */
        waterArea.style.backgroundColor = '#2c3e50';
    } else {
        PLAYER_HEIGHT        = 60;  /* ✏️  어려움 포획 바 높이 */
        currentFishSpeedBase = 22;  /* ✏️  어려움 물고기 최대 속도 */
        waterArea.style.backgroundColor = '#1a0033';
    }

    playerBar.style.height = PLAYER_HEIGHT + 'px';

    document.getElementById('fishing-menu').style.display = 'none';
    document.getElementById('fishing-play').style.display = 'block';

    startFishingLogic(myCharId);
};

/*
 * [함수] startFishingLogic
 *
 * 낚시 게임 내부 상태를 초기화하고 게임 루프를 시작합니다.
 * prepareFishing() 에서 호출됩니다.
 */
function startFishingLogic(myCharId) {
    var actionBtn   = document.getElementById('fishing-action-btn');
    var gameMessage = document.getElementById('fishing-message');

    fishingProgress       = 20;   /* 게이지 시작값 20% */
    fishingFishY          = 120;
    fishingPlayerY        = 0;
    fishingPlayerVelocity = 0;
    isPressingFishingBtn  = false;
    fishingActive         = true;

    gameMessage.innerHTML  = '버튼을 꾹 눌러 물고기를<br>포획 영역(초록 박스) 안에 가두세요.';
    gameMessage.style.color = '#fff';
    actionBtn.innerText    = '누르기 (Hold)';
    actionBtn.disabled     = false;

    cancelAnimationFrame(fishingAnimationFrame);
    updateFishingGame(myCharId);
}

/*
 * [함수] updateFishingGame
 *
 * 낚시 게임의 매 프레임 로직입니다. requestAnimationFrame 으로 반복 호출됩니다.
 *
 * 물고기 움직임:
 *   - 5% 확률로 방향이 바뀜
 *   - 위 / 아래 벽에 닿으면 반사
 *
 * 포획 바 움직임:
 *   - 버튼을 누르고 있으면 속도가 위로 가속
 *   - 떼면 아래로 가속 (중력)
 *   - 속도에 0.8 감속 적용 (관성 효과)
 *
 * 포획 판정:
 *   - 물고기 중심이 포획 바 영역 안 → 게이지 증가
 *   - 영역 밖 → 게이지 감소
 *   - 게이지 100 → 성공 / 게이지 0 → 실패
 */
function updateFishingGame(myCharId) {
    if (!fishingActive) return;

    var fishZone    = document.getElementById('fish-zone');
    var playerBar   = document.getElementById('player-bar');
    var progressBar = document.getElementById('progress-bar');

    /* 물고기 방향 무작위 변경 (5% 확률) */
    if (Math.random() < 0.05) {
        fishingFishSpeed = (Math.random() - 0.5) * currentFishSpeedBase;
    }
    fishingFishY += fishingFishSpeed;

    /* 벽 충돌 반사 */
    if (fishingFishY < 0)                           { fishingFishY = 0;                          fishingFishSpeed *= -1; }
    if (fishingFishY > WATER_HEIGHT - FISH_HEIGHT)  { fishingFishY = WATER_HEIGHT - FISH_HEIGHT; fishingFishSpeed *= -1; }

    /* 포획 바 가속 */
    if (isPressingFishingBtn) fishingPlayerVelocity += 1.5;
    else                      fishingPlayerVelocity -= 1.5;
    fishingPlayerVelocity *= 0.8; /* 감속 (관성) */
    fishingPlayerY        += fishingPlayerVelocity;

    if (fishingPlayerY < 0)                            { fishingPlayerY = 0;                           fishingPlayerVelocity = 0; }
    if (fishingPlayerY > WATER_HEIGHT - PLAYER_HEIGHT) { fishingPlayerY = WATER_HEIGHT - PLAYER_HEIGHT; fishingPlayerVelocity = 0; }

    /* 포획 판정 */
    var fishCenterY   = fishingFishY + (FISH_HEIGHT / 2);
    var isOverlapping = (fishCenterY >= fishingPlayerY) && (fishCenterY <= fishingPlayerY + PLAYER_HEIGHT);

    if (isOverlapping) {
        fishingProgress += 0.4;
        playerBar.className = 'catch-success';
    } else {
        fishingProgress -= 0.2;
        playerBar.className = 'catch-fail';
    }

    fishingProgress = Math.max(0, Math.min(100, fishingProgress));

    /* DOM 위치 갱신 */
    fishZone.style.bottom   = fishingFishY   + 'px';
    playerBar.style.bottom  = fishingPlayerY + 'px';
    progressBar.style.width = fishingProgress + '%';

    if (fishingProgress >= 100) {
        endFishingGame(true,  myCharId);
    } else if (fishingProgress <= 0) {
        endFishingGame(false, myCharId);
    } else {
        fishingAnimationFrame = requestAnimationFrame(function () {
            updateFishingGame(myCharId);
        });
    }
}

/*
 * [함수] endFishingGame
 *
 * 낚시 게임을 종료합니다.
 * 성공 시 보상을 계산해 DB 에 저장합니다.
 *
 * ✏️  보상 범위:
 *   easy: 100 ~ 500 G
 *   hard: 300 ~ 1000 G
 *
 * 매개변수:
 *   isWin    — true: 성공, false: 실패
 *   myCharId — 보상 지급 대상
 */
async function endFishingGame(isWin, myCharId) {
    fishingActive = false;
    cancelAnimationFrame(fishingAnimationFrame);

    var gameMessage = document.getElementById('fishing-message');
    var actionBtn   = document.getElementById('fishing-action-btn');
    var playerBar   = document.getElementById('player-bar');

    playerBar.className = '';
    actionBtn.disabled  = true;

    if (isWin) {
        var minReward = currentDifficulty === 'easy' ? 100  : 300;  /* ✏️ */
        var maxReward = currentDifficulty === 'easy' ? 500  : 1000; /* ✏️ */
        var reward    = Math.floor(Math.random() * (maxReward - minReward + 1)) + minReward;

        gameMessage.innerHTML  = '<b>월척입니다!</b><br>' + reward.toLocaleString() + ' G 획득';
        gameMessage.style.color = '#cccccc';
        actionBtn.innerText    = '보상 획득 중...';

        var dbMoney = await _getLatestMoney(myCharId);
        currentEditingId    = myCharId;
        currentEditingPhase = 0;
        var res = await upsertProfileData({ money: dbMoney + reward });
        if (!res || !res.error) {
            currentMoney = dbMoney + reward;
            await _refreshMiniGameMoneyDisplay();
            if (typeof loadCharacterData === 'function') await loadCharacterData();
        }
    } else {
        gameMessage.innerHTML  = '물고기가 도망갔습니다.';
        gameMessage.style.color = '#555555';
    }

    setTimeout(function () {
        document.getElementById('fishing-play').style.display = 'none';
        document.getElementById('fishing-menu').style.display = 'flex';
        gameMessage.innerHTML  = '낚시터를 선택하세요.';
        gameMessage.style.color = '#fff';
    }, 2000);
}


/* ================================================================= */
/* 5. 증권거래소                                                       */
/* ================================================================= */

/*
 * 증권거래소 상태 변수
 *
 *   _stockChart   — Chart.js 인스턴스 (업데이트 시 재사용)
 *   _stockHistory — 차트 시계열 데이터 {labels, a(A기업), b(B기업)}
 *   _stockInited  — 중복 초기화 방지 플래그
 *
 *   _marketState  — 현재 주가 상태
 *     a, b         : 현재가 (G)
 *     a_trend      : A기업 추세 (+1: 상승, -1: 하락)
 *     b_trend      : B기업 추세
 *     last_updated : 마지막 DB 저장 시각
 *
 *   _stockTickCount  — 누적 틱 수 (이벤트 발생 타이밍 계산)
 *   TICK_INTERVAL_MS — 주가 갱신 주기 (ms)
 */
var _stockChart   = null;
var _stockHistory = { labels: [], a: [], b: [] };
var _stockInited  = false;

var _marketState = {
    a:           74000,  /* ✏️  A기업 시작 주가 */
    b:           165000, /* ✏️  B기업 시작 주가 */
    a_trend:     1,
    b_trend:     1,
    last_updated: Date.now()
};

var _stockTickCount   = 0;
var TICK_INTERVAL_MS  = 3000; /* ✏️  주가 갱신 주기 (ms) */

function _getActivePrices() {
    return { a: _marketState.a, b: _marketState.b };
}

/*
 * [함수] initStockSystem
 *
 * 증권거래소 탭을 열 때 한 번만 호출되는 초기화 함수입니다.
 *   1. Chart.js 로 주가 그래프 생성
 *   2. DB 에서 저장된 주가 / 추세 불러오기
 *   3. 오프라인 동안 놓친 틱 시뮬레이션
 *   4. 내 보유 주식 불러오기
 *   5. 3초마다 주가 갱신 인터벌 시작
 *
 * ✏️  기업명을 바꾸려면 datasets[0].label / datasets[1].label 을 수정하세요.
 * ✏️  chart 색상을 바꾸려면 borderColor 값을 수정하세요.
 */
async function initStockSystem() {
    if (_stockInited) return;
    _stockInited = true;

    var canvas = document.getElementById('stockChart');
    if (!canvas || typeof Chart === 'undefined') return;
    var ctx = canvas.getContext('2d');

    /* 차트 아래 영역 그라데이션 채우기 */
    var gradA = ctx.createLinearGradient(0, 0, 0, 250);
    gradA.addColorStop(0, 'rgba(200, 200, 200, 0.4)');
    gradA.addColorStop(1, 'rgba(200, 200, 200, 0.0)');
    var gradB = ctx.createLinearGradient(0, 0, 0, 250);
    gradB.addColorStop(0, 'rgba(100, 100, 100, 0.4)');
    gradB.addColorStop(1, 'rgba(100, 100, 100, 0.0)');

    _stockChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: _stockHistory.labels,
            datasets: [
                {
                    label:           'A기업',      /* ✏️  기업명 변경 */
                    borderColor:     '#cccccc',
                    backgroundColor: gradA,
                    data:            _stockHistory.a,
                    borderWidth:     2,
                    tension:         0.2,
                    fill:            true,
                    pointRadius:     2,
                    pointBackgroundColor: '#cccccc'
                },
                {
                    label:           'B기업',      /* ✏️  기업명 변경 */
                    borderColor:     '#777777',
                    backgroundColor: gradB,
                    data:            _stockHistory.b,
                    borderWidth:     2,
                    tension:         0.2,
                    fill:            true,
                    pointRadius:     2,
                    pointBackgroundColor: '#777777'
                },
            ],
        },
        options: {
            responsive:          true,
            maintainAspectRatio: false,
            animation:           { duration: 400, easing: 'linear' },
            plugins: {
                legend:  { labels: { color: '#aaa' } },
                tooltip: { mode: 'index', intersect: false },
            },
            scales: {
                x: { ticks: { color: '#555', maxTicksLimit: 10 }, grid: { display: false } },
                y: { ticks: { color: '#666' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            },
        },
    });

    await _syncMarketDataFromDB();
    await _loadMyHoldings();

    setInterval(_tickStock, TICK_INTERVAL_MS);
    _tickStock(false); /* 최초 1회 즉시 실행 */
}

/*
 * [함수] _syncMarketDataFromDB
 *
 * DB(market_data) 에서 저장된 최신 주가와 추세를 읽어옵니다.
 * 마지막 저장 이후 경과 시간으로 놓친 틱을 시뮬레이션합니다.
 * 덕분에 오프라인 중에도 주가가 연속적으로 흘러갑니다.
 *
 * ⚠️  market_data 테이블의 id=1 행이 반드시 있어야 합니다.
 *     없으면 SQL Editor 에서 아래 쿼리를 실행하세요:
 *     INSERT INTO market_data (id, samsung_price, sk_price, samsung_trend, sk_trend)
 *     VALUES (1, 74000, 165000, 1, 1);
 *
 * ✏️  DB 컬럼명이 다르면 아래 필드명을 수정하세요.
 */
async function _syncMarketDataFromDB() {
    if (!supabaseClient) return;
    var res = await supabaseClient.from('market_data').select('*').eq('id', 1).single();
    if (res.error || !res.data) return;

    var data        = res.data;
    var lastUpdated = new Date(data.last_updated).getTime();
    var missedTicks = Math.floor((Date.now() - lastUpdated) / TICK_INTERVAL_MS);

    /* DB 값으로 상태 복원 */
    _marketState.a       = data.samsung_price; /* ✏️  컬럼명 */
    _marketState.b       = data.sk_price;      /* ✏️  컬럼명 */
    _marketState.a_trend = data.samsung_trend;
    _marketState.b_trend = data.sk_trend;

    /* 오프라인 동안 놓친 틱 시뮬레이션 (최대 1000틱 제한) */
    if (missedTicks > 0) {
        var simulate = Math.min(missedTicks, 1000);
        for (var i = 0; i < simulate; i++) _simulateSingleTick();
        await _saveMarketDataToDB();
    }
}

/*
 * [함수] _simulateSingleTick
 *
 * 1틱 분량의 주가 계산 로직입니다.
 * _tickStock() 과 _syncMarketDataFromDB() 에서 공통으로 사용합니다.
 *
 * 주가 변동 방식:
 *   - 매 틱: -1% ~ +1% 무작위 변동 + 추세 방향으로 0.5% 보정
 *   - 2400틱마다: 추세(상승 / 하락) 무작위 재결정
 *   - 600틱마다 : 큰 이벤트 발생 — 추세 방향으로 20~50% 급등락
 *   - 최저가     : 1000 G
 *
 * ✏️  변동폭과 이벤트 빈도를 조절하려면 아래 숫자를 수정하세요.
 */
function _simulateSingleTick() {
    _stockTickCount++;

    /* 2400틱마다 추세 전환 (2400 * 3초 = 약 2시간) */
    if (_stockTickCount % 2400 === 0) {
        _marketState.a_trend = Math.random() < 0.5 ? 1 : -1;
        _marketState.b_trend = Math.random() < 0.5 ? 1 : -1;
    }

    var aChange = (Math.random() * 0.02 - 0.01) + (_marketState.a_trend * 0.005);
    var bChange = (Math.random() * 0.02 - 0.01) + (_marketState.b_trend * 0.005);

    /* 600틱마다 큰 이벤트 (600 * 3초 = 30분) */
    if (_stockTickCount % 600 === 0) {
        var aDir = Math.random() < 0.7 ? _marketState.a_trend : -_marketState.a_trend;
        var bDir = Math.random() < 0.7 ? _marketState.b_trend : -_marketState.b_trend;
        aChange  = aDir * (Math.random() * 0.30 + 0.20); /* 20~50% 급변 */
        bChange  = bDir * (Math.random() * 0.30 + 0.20);
    }

    _marketState.a = Math.max(1000, Math.floor(_marketState.a * (1 + aChange)));
    _marketState.b = Math.max(1000, Math.floor(_marketState.b * (1 + bChange)));
}

/*
 * [함수] _saveMarketDataToDB
 *
 * 현재 _marketState 를 market_data 테이블(id=1)에 저장합니다.
 * 10틱마다 한 번씩 호출해 불필요한 DB 쓰기를 줄입니다.
 *
 * ✏️  DB 컬럼명이 다르면 아래 필드명을 맞게 수정하세요.
 */
async function _saveMarketDataToDB() {
    if (!supabaseClient) return;
    _marketState.last_updated = new Date().toISOString();
    await supabaseClient.from('market_data').update({
        samsung_price: _marketState.a,  /* ✏️  컬럼명 */
        sk_price:      _marketState.b,  /* ✏️  컬럼명 */
        samsung_trend: _marketState.a_trend,
        sk_trend:      _marketState.b_trend,
        last_updated:  _marketState.last_updated
    }).eq('id', 1);
}

/*
 * [함수] _tickStock
 *
 * TICK_INTERVAL_MS 마다 주가를 갱신하고 차트를 업데이트합니다.
 * setInterval 로 반복 호출됩니다.
 *
 * 매개변수:
 *   updateDB — false 이면 DB 저장 생략 (최초 초기화 시 사용)
 */
function _tickStock(updateDB) {
    if (updateDB === undefined) updateDB = true;

    var now   = new Date();
    var label = String(now.getMinutes()).padStart(2, '0') + ':' + String(now.getSeconds()).padStart(2, '0');

    if (updateDB) {
        _simulateSingleTick();
        if (_stockTickCount % 10 === 0) _saveMarketDataToDB(); /* 10틱(30초)마다 저장 */
    }

    _stockHistory.labels.push(label);
    _stockHistory.a.push(_marketState.a);
    _stockHistory.b.push(_marketState.b);

    /* 최대 25개 포인트만 유지 */
    if (_stockHistory.labels.length > 25) {
        _stockHistory.labels.shift();
        _stockHistory.a.shift();
        _stockHistory.b.shift();
    }

    if (_stockChart) _stockChart.update();

    /* 화면의 현재가 업데이트 */
    var aEl = document.getElementById('price-a'); /* ✏️  HTML id 와 맞추세요 */
    var bEl = document.getElementById('price-b');
    if (aEl) aEl.innerText = _marketState.a.toLocaleString() + ' G';
    if (bEl) bEl.innerText = _marketState.b.toLocaleString() + ' G';

    window.currentPrices = { a: _marketState.a, b: _marketState.b };
}

/*
 * [함수] _loadMyHoldings
 *
 * DB 에서 내 캐릭터의 보유 주식을 불러와 window.myHoldings 에 저장합니다.
 */
async function _loadMyHoldings() {
    if (!currentUser || !supabaseClient) return;
    var myCharId = charOwners[currentUser.email];
    if (!myCharId) return;

    var res = await supabaseClient
        .from('character_profiles').select('stocks')
        .eq('char_id', myCharId).eq('phase', 0).single();

    if (res.data && res.data.stocks) {
        window.myHoldings = typeof res.data.stocks === 'string'
            ? JSON.parse(res.data.stocks) : res.data.stocks;
    }
    window.updateStockUI();
}

/*
 * [함수] updateStockUI
 *
 * 화면의 보유 주식 표시를 갱신합니다.
 */
window.updateStockUI = function () {
    var display = document.getElementById('stock-holdings-display');
    var h = window.myHoldings || { a: 0, b: 0 };
    if (display)
        display.innerText = 'A기업 ' + (h.a || 0) + '주 / B기업 ' + (h.b || 0) + '주';
};

/*
 * [함수] tradeStock
 *
 * 주식 매수 또는 매도를 처리합니다.
 *
 * 매개변수:
 *   corp   — 'a' 또는 'b'
 *   action — 'buy'(매수) 또는 'sell'(매도)
 *
 * 처리 순서:
 *   1. 로그인 / 권한 / 현재 가격 확인
 *   2. 수량 입력 (prompt)
 *   3. DB 에서 최신 소지금 & 보유 주식 조회
 *   4. 매수: 잔액 확인 → 차감 → 보유 주식 증가
 *      매도: 보유 주식 확인 → 처분 → 잔액 증가
 *   5. DB 저장
 */
window.tradeStock = async function (corp, action) {
    if (!currentUser) return alert('로그인이 필요합니다.');
    var myCharId = charOwners[currentUser.email];
    if (!myCharId) return alert('캐릭터 권한이 없습니다.');

    var prices   = _getActivePrices();
    var corpName = corp === 'a' ? 'A기업' : 'B기업'; /* ✏️  기업명 */
    var price    = prices[corp];
    if (!price) return alert('가격 정보를 불러올 수 없습니다.');

    var qtyStr = prompt(
        action === 'buy'
            ? '[' + corpName + '] 매수할 주 수\n현재가: ' + price.toLocaleString() + ' G/주'
            : '[' + corpName + '] 매도할 주 수',
        '1'
    );
    if (!qtyStr) return;
    var qty = parseInt(qtyStr);
    if (isNaN(qty) || qty < 1) return alert('올바른 수량을 입력하세요.');

    var fetchRes = await supabaseClient
        .from('character_profiles').select('money, stocks')
        .eq('char_id', myCharId).eq('phase', 0).single();

    var myMoney  = (fetchRes.data && fetchRes.data.money)
        ? parseInt(String(fetchRes.data.money).replace(/,/g, ''), 10) : 0;
    var holdings = { a: 0, b: 0 };
    if (fetchRes.data && fetchRes.data.stocks) {
        holdings = typeof fetchRes.data.stocks === 'string'
            ? JSON.parse(fetchRes.data.stocks) : fetchRes.data.stocks;
    }
    window.myHoldings = holdings;

    var total = price * qty;

    if (action === 'buy') {
        if (myMoney < total)
            return alert('소지금 부족!\n필요: ' + total.toLocaleString() + ' G / 보유: ' + myMoney.toLocaleString() + ' G');
        myMoney -= total;
        holdings[corp] = (holdings[corp] || 0) + qty;
        alert('[' + corpName + '] ' + qty + '주 매수\n합계: ' + total.toLocaleString() + ' G\n잔액: ' + myMoney.toLocaleString() + ' G');
    } else {
        var held = holdings[corp] || 0;
        if (held < qty)
            return alert('보유 주식 부족!\n보유: ' + held + '주 / 요청: ' + qty + '주');
        myMoney += total;
        holdings[corp] = held - qty;
        alert('[' + corpName + '] ' + qty + '주 매도\n합계: +' + total.toLocaleString() + ' G\n잔액: ' + myMoney.toLocaleString() + ' G');
    }

    window.myHoldings  = holdings;
    currentEditingId    = myCharId;
    currentEditingPhase = 0;
    var saveRes = await upsertProfileData({ money: myMoney, stocks: JSON.stringify(holdings) });
    if (saveRes && saveRes.error) {
        alert('거래 처리 중 오류가 발생했습니다.');
    } else {
        window.updateStockUI();
        if (typeof updateShopMoneyDisplay === 'function') updateShopMoneyDisplay();
    }
};


/* ================================================================= */
/* 6. 탭 전환 & 타임라인(Phase) 전역 동기화                            */
/* ================================================================= */

/*
 * [함수] changePhase
 *
 * 특정 카드 안의 탭(1부 ~ 4부)을 전환합니다.
 * 버튼의 가장 가까운 .content-card 를 기준으로 동작하므로
 * 여러 섹션에 재사용할 수 있습니다.
 *
 * 매개변수:
 *   btn — 클릭된 탭 버튼 요소
 *   idx — 표시할 슬라이드 인덱스 (0 ~ 3)
 *
 * 처리:
 *   1. 같은 .content-card 안 모든 탭 버튼에서 active 제거 후 클릭된 것에 추가
 *   2. 슬라이드 전환
 *   3. 50ms 뒤 레이더 차트 재렌더링
 *      (슬라이드가 숨겨진 상태에서는 캔버스 크기가 0 이라 차트가 깨짐)
 */
window.changePhase = function (btn, idx) {
    if (!btn) return;
    var sec = btn.closest('.content-card');
    if (!sec) return;

    var btns   = sec.querySelectorAll('.phase-btn');
    var slides = sec.querySelectorAll('.phase-slide');

    btns.forEach(function (t) { t.classList.remove('active'); });
    if (btns[idx]) btns[idx].classList.add('active');

    if (slides.length > 0) {
        slides.forEach(function (s) { s.classList.remove('active'); });
        if (slides[idx]) {
            slides[idx].classList.add('active');
            setTimeout(function () {
                if (typeof drawAllRadarCharts === 'function') drawAllRadarCharts(slides[idx]);
            }, 50);
        }
    }

    window.currentEditingPhase = idx;
};

/*
 * [함수] syncAllTabs
 *
 * 화면에 있는 모든 챕터 탭을 지정한 챕터로 일괄 전환합니다.
 * 관리자가 타임라인을 바꾸거나 Realtime 이벤트를 받았을 때 호출됩니다.
 *
 * '1부' 텍스트가 포함된 탭 컨테이너만 찾아 전환하여
 * 미니게임 탭 등과 혼동되지 않도록 합니다.
 *
 * 매개변수:
 *   phase — 0(1부) ~ 3(4부)
 */
window.syncAllTabs = function (phase) {
    window.globalMainPhase = phase;

    document.querySelectorAll('.phase-tabs').forEach(function (tabContainer) {
        var buttons = tabContainer.querySelectorAll('.phase-btn');
        if (buttons.length > 0 && buttons[0].innerText.includes('1부')) {
            if (buttons[phase]) buttons[phase].click();
        }
    });
};

/*
 * [함수] setGlobalPhase
 *
 * 사이드바 타임라인 셀렉트 변경 시 호출됩니다.
 * 관리자만 사용 가능하며, 변경값을 DB(system_settings) 에 저장합니다.
 * DB 저장값은 Realtime 구독을 통해 모든 접속자에게 실시간 전파됩니다.
 *
 * 매개변수:
 *   val — 셀렉트 값 ('0' ~ '3')
 */
window.setGlobalPhase = async function (val) {
    var newPhase = parseInt(val, 10);

    if (typeof window.isAdmin === 'function' && !window.isAdmin()) {
        alert('타임라인 변경 권한이 없습니다.');
        document.getElementById('global-main-phase').value = window.globalMainPhase || 0;
        return;
    }

    var res = await supabaseClient
        .from('system_settings')
        .update({ current_phase: newPhase })
        .eq('id', 1);

    if (res.error) {
        alert('저장 실패: ' + res.error.message);
    } else {
        window.syncAllTabs(newPhase);
    }
};

/*
 * Realtime 구독 — system_settings 테이블 변경 감지
 *
 * 관리자가 타임라인을 바꾸면 system_settings.current_phase 가 업데이트됩니다.
 * 이 구독이 변경을 감지해 모든 접속자의 화면을 자동으로 동기화합니다.
 *
 * 작동 조건:
 *   Supabase SQL Editor 에서 다음 쿼리를 실행해야 합니다:
 *   ALTER PUBLICATION supabase_realtime ADD TABLE system_settings;
 */
if (typeof supabaseClient !== 'undefined' && supabaseClient) {
    supabaseClient
        .channel('phase_sync')
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'system_settings' },
            function (payload) {
                var syncedPhase = payload.new.current_phase;
                var selectBox   = document.getElementById('global-main-phase');
                if (selectBox) selectBox.value = syncedPhase;
                window.syncAllTabs(syncedPhase);
            }
        )
        .subscribe();
}
