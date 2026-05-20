/* ================================================================= */
/*  Features.js — 갤러리 / 상점 / 캘린더 / 미니게임                    */
/*                                                                   */
/*  이 파일이 담당하는 일:                                             */
/*  1. Gallery (화첩) — 게시글/답글 작성·삭제·페이지 전환              */
/*  2. Shop (상점) — 아이템 목록 렌더링 / 구매 처리                    */
/*  3. Calendar (캘린더) — 월별 이벤트 표시 / 추가·삭제               */
/*  4. MiniGames (미니게임) — 동전던지기 / 야바위 / 사냥터              */
/*                                                                   */
/*  ✏️  수정 포인트:                                                   */
/*  - 상점 아이템: Config.js의 shopItems 배열을 수정하세요.             */
/*  - 미니게임 보상: 각 게임 함수 안의 reward 계산식을 수정하세요.       */
/* ================================================================= */


/* ================================================================= */
/* 1. 갤러리 (화첩 / 팬아트 게시판)                                    */
/* ================================================================= */

/**
 * DB에서 갤러리 게시글을 불러와 화면에 렌더링합니다.
 * Gallery 탭이 열리거나 챕터를 전환할 때 호출됩니다.
 *
 * 매개변수:
 *   page : 표시할 페이지 번호 (1부터 시작)
 */
async function loadGalleryData(page) {
    page = page || 1;
    currentGalleryPage = page;

    var container = document.getElementById('gallery-list-container');
    if (!container) return;

    /*
     * 현재 선택된 챕터(currentEditingPhase)에 해당하는 게시글만 조회합니다.
     * 오래된 것부터 표시 (ascending: true)
     */
    var res = await supabaseClient
        .from('gallery_posts')
        .select('*')
        .eq('phase', currentEditingPhase)
        .order('created_at', { ascending: true });

    var data  = res.data;
    var error = res.error;

    if (error || !data || data.length === 0) {
        container.innerHTML = error
            ? '<p style="color:#555; text-align:center;">데이터를 불러오는 중 오류가 발생했습니다.</p>'
            : '<p style="color:#555; text-align:center; padding:40px 0;">아직 게시글이 없습니다. 첫 번째 기록을 남겨보세요!</p>';
        return;
    }

    /* 본문 게시글(parent_id가 없는 것)과 답글(parent_id가 있는 것) 분리 */
    var mainPosts  = data.filter(function (p) { return !p.parent_id; });
    var replies    = data.filter(function (p) { return  p.parent_id; });

    /* 페이지네이션 계산 */
    var totalPages  = Math.ceil(mainPosts.length / GALLERY_POSTS_PER_PAGE);
    var startIndex  = (currentGalleryPage - 1) * GALLERY_POSTS_PER_PAGE;
    var currentPosts = mainPosts.slice(startIndex, startIndex + GALLERY_POSTS_PER_PAGE);

    /* 현재 로그인한 사용자의 캐릭터 ID (본인 글만 삭제 버튼 표시) */
    var myCharId = currentUser ? charOwners[currentUser.email] : null;

    var html = '';

    currentPosts.forEach(function (post) {
        /* 본인 게시글이면 삭제 버튼 표시 */
        var isMine    = (myCharId === post.char_id);
        var deleteBtn = isMine
            ? '<button class="btn-reply" onclick="deleteGalleryPost(' + post.id + ')" style="color:#888;">Delete</button>'
            : '';

        /* 이 게시글에 달린 답글들 */
        var postReplies = replies.filter(function (r) { return r.parent_id == post.id; });
        var replyCount  = postReplies.length;

        /* 답글이 있으면 '답글 N개 보기' 토글 버튼 표시 */
        var toggleBtn = replyCount > 0
            ? '<button class="btn-toggle-replies" onclick="toggleReplies(' + post.id + ')">Replies (' + replyCount + ')</button>'
            : '';

        /* 답글 HTML 생성 */
        var repliesHtml = postReplies.map(function (r) {
            var isReplyMine  = (myCharId === r.char_id);
            var replyDelBtn  = isReplyMine
                ? '<button class="btn-reply" style="padding:4px 10px; font-size:0.72rem;" onclick="deleteGalleryPost(' + r.id + ')">Delete</button>'
                : '';
            return '<div class="reply-item">' +
                (r.image_url ? '<img src="' + r.image_url + '" class="reply-img" onclick="openLightbox(this.src)">' : '') +
                '<div class="post-info">' +
                    '<div style="display:flex; justify-content:space-between; align-items:center;">' +
                        '<div class="post-author" style="font-size:0.88rem;">' + r.char_name + '</div>' +
                        replyDelBtn +
                    '</div>' +
                    '<div class="post-content" style="font-size:0.88rem; margin-top:5px;">' + (r.content || '') + '</div>' +
                '</div></div>';
        }).join('');

        /* 게시글 카드 HTML */
        html +=
            '<div class="gallery-post-container">' +
                '<div class="post-main">' +
                    (post.image_url ? '<img src="' + post.image_url + '" class="post-img" onclick="openLightbox(this.src)">' : '') +
                    '<div class="post-info">' +
                        '<div class="post-author">' + post.char_name + '</div>' +
                        '<div class="post-date">' + new Date(post.created_at).toLocaleString() + '</div>' +
                        '<div class="post-content">' + (post.content || '') + '</div>' +
                        '<div style="display:flex; gap:10px; margin-top:10px; align-items:center;">' +
                            '<button class="btn-reply" onclick="showReplyForm(' + post.id + ')">Reply</button>' +
                            deleteBtn +
                        '</div>' +
                        toggleBtn +
                    '</div>' +
                '</div>' +
                /* 답글 컨테이너 (기본 숨김) */
                '<div class="post-replies" id="replies-' + post.id + '" style="display:none;">' + repliesHtml + '</div>' +
            '</div>';
    });

    /* 페이지네이션 버튼 HTML */
    if (totalPages > 1) {
        html += '<div class="gallery-pagination">';
        for (var i = 1; i <= totalPages; i++) {
            html += '<button class="page-btn ' + (i === currentGalleryPage ? 'active' : '') + '" onclick="loadGalleryData(' + i + ')">' + i + '</button>';
        }
        html += '</div>';
    }

    container.innerHTML = html;
}

/**
 * 답글 목록을 펼치거나 접습니다.
 */
window.toggleReplies = function (postId) {
    var repliesDiv = document.getElementById('replies-' + postId);
    var btn        = document.querySelector('button[onclick="toggleReplies(' + postId + ')"]');
    if (!repliesDiv || !btn) return;

    var isHidden = (repliesDiv.style.display === 'none');
    repliesDiv.style.display = isHidden ? 'flex' : 'none';
    btn.innerText = isHidden ? btn.innerText.replace('Replies', 'Hide') : btn.innerText.replace('Hide', 'Replies');
};

/**
 * 답글 작성 모달을 엽니다.
 *
 * 매개변수:
 *   parentId : 답글을 달 원본 게시글의 id
 */
window.showReplyForm = function (parentId) {
    document.getElementById('reply-parent-id').value     = parentId;
    document.getElementById('reply-modal-content').value = '';
    document.getElementById('reply-modal-file').value    = '';
    document.getElementById('reply-modal').classList.add('show');
};

/**
 * 갤러리에 새 게시글을 작성합니다.
 * 이미지가 있으면 먼저 imgbb에 업로드합니다.
 */
window.uploadGalleryPost = async function () {
    /* 로그인 확인 */
    if (!currentUser) { alert('로그인이 필요합니다.'); return; }

    var myCharId = charOwners[currentUser.email];
    if (!myCharId) { alert('캐릭터 권한이 없습니다.'); return; }

    var content   = document.getElementById('gal-content').value;
    var fileInput = document.getElementById('gal-file');

    if (!content && fileInput.files.length === 0) {
        alert('내용 또는 이미지를 입력해주세요.');
        return;
    }

    /* 이미지 업로드 (있을 경우) */
    var uploadedUrl = null;
    if (fileInput.files.length > 0) {
        var btn     = event.target;
        btn.innerText = 'Uploading...';
        btn.disabled  = true;
        uploadedUrl   = await uploadToImgbb(fileInput.files[0]);
        if (!uploadedUrl) {
            alert('이미지 업로드에 실패했습니다.');
            btn.innerText = 'Post';
            btn.disabled  = false;
            return;
        }
    }

    /* 캐릭터 이름 찾기 */
    var charName = (charData.find(function (c) {
        return c.id === myCharId.replace('char-', '');
    }) || {}).name || '익명';

    /* DB에 게시글 삽입 */
    var res = await supabaseClient.from('gallery_posts').insert([{
        char_id:   myCharId,
        char_name: charName,
        content:   content,
        image_url: uploadedUrl,
        parent_id: null,           /* 답글이 아니므로 null */
        phase:     currentEditingPhase,
    }]);

    if (res.error) {
        alert('게시글 저장에 실패했습니다.');
    } else {
        /* 입력 초기화 */
        document.getElementById('gal-content').value = '';
        document.getElementById('gal-file').value    = '';
        if (fileInput.files.length > 0) {
            event.target.innerText = 'Post';
            event.target.disabled  = false;
        }
        loadGalleryData(currentGalleryPage); /* 목록 새로고침 */
    }
};

/**
 * 답글을 작성합니다.
 */
window.submitReply = async function () {
    var parentId = document.getElementById('reply-parent-id').value;
    if (!currentUser) { alert('로그인이 필요합니다.'); return; }

    var myCharId = charOwners[currentUser.email];
    if (!myCharId) { alert('캐릭터 권한이 없습니다.'); return; }

    var content   = document.getElementById('reply-modal-content').value;
    var fileInput = document.getElementById('reply-modal-file');

    if (!content && fileInput.files.length === 0) {
        alert('내용 또는 이미지를 입력해주세요.');
        return;
    }

    var uploadedUrl = null;
    if (fileInput.files.length > 0) {
        var btn     = event.target;
        btn.innerText = 'Uploading...';
        btn.disabled  = true;
        uploadedUrl   = await uploadToImgbb(fileInput.files[0]);
        if (!uploadedUrl) {
            alert('이미지 업로드에 실패했습니다.');
            btn.innerText = 'Post';
            btn.disabled  = false;
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
        parent_id: parentId,  /* 원본 게시글 id */
        phase:     currentEditingPhase,
    }]);

    if (res.error) {
        alert('저장 실패');
    } else {
        if (fileInput.files.length > 0) {
            event.target.innerText = 'Post';
            event.target.disabled  = false;
        }
        closeModal('reply-modal');
        loadGalleryData(currentGalleryPage);

        /* 답글을 작성했으면 해당 답글 목록을 자동으로 열기 */
        setTimeout(function () {
            var repliesDiv = document.getElementById('replies-' + parentId);
            if (repliesDiv && repliesDiv.style.display === 'none') {
                repliesDiv.style.display = 'flex';
            }
        }, 500);
    }
};

/**
 * 게시글(또는 답글)을 삭제합니다.
 * 본인 게시글만 삭제할 수 있습니다. (HTML에서 삭제 버튼 자체를 숨김)
 */
window.deleteGalleryPost = async function (postId) {
    if (!confirm('이 게시글을 삭제하시겠습니까?')) return;

    var res = await supabaseClient.from('gallery_posts').delete().eq('id', postId);

    if (res.error) {
        alert('삭제 실패');
    } else {
        loadGalleryData(currentGalleryPage); /* 목록 새로고침 */
    }
};


/* ================================================================= */
/* 2. 상점 (아이템 구매 시스템)                                        */
/* ================================================================= */

/*
 * 상점 상태 변수
 * currentShopPage : 현재 페이지 번호
 * currentShopTab  : 현재 탭 ('general'=일반, 'furniture'=가구)
 * SHOP_ITEMS_PER_PAGE : 한 페이지에 표시할 아이템 수
 */
var SHOP_ITEMS_PER_PAGE = 8;
var currentShopPage     = 1;
var currentShopTab      = 'general';

/**
 * 상점 탭을 전환합니다. (Items ↔ Furniture)
 */
window.changeShopTab = function (tab) {
    currentShopTab  = tab;
    currentShopPage = 1;

    /* 탭 버튼 active 상태 변경 */
    var tabs = document.querySelectorAll('#shop-tabs .phase-btn');
    tabs.forEach(function (btn, i) {
        btn.classList.toggle('active', (tab === 'general') ? (i === 0) : (i === 1));
    });

    window.renderShop();
};

/**
 * 상점 페이지를 전환합니다.
 */
window.changeShopPage = function (page) {
    currentShopPage = page;
    window.renderShop();
};

/**
 * 수량 버튼(+/-) 클릭 시 수량을 변경합니다.
 *
 * 매개변수:
 *   idx   : shopItems 배열에서의 인덱스
 *   delta : +1 (증가) or -1 (감소)
 */
window.shopQtyChange = function (idx, delta) {
    var qtyEl   = document.getElementById('shop-qty-'   + idx);
    var totalEl = document.getElementById('shop-total-' + idx);
    if (!qtyEl) return;

    /* 수량 범위: 1~10 */
    var qty = Math.max(1, Math.min(parseInt(qtyEl.innerText) + delta, 10));
    qtyEl.innerText = qty;

    /* 총 가격 업데이트 */
    if (totalEl && window.shopItems[idx]) {
        totalEl.innerText = (window.shopItems[idx].price * qty).toLocaleString() + ' G';
    }
};

/**
 * 상점 화면 상단에 현재 소지금을 표시합니다.
 */
window.updateShopMoneyDisplay = async function () {
    var display = document.getElementById('shop-my-money');
    if (!display) return;

    if (!currentUser) { display.innerText = 'Login required'; return; }

    var myCharId = charOwners[currentUser.email];
    if (!myCharId) { display.innerText = 'No character'; return; }

    var res = await supabaseClient
        .from('character_profiles')
        .select('money')
        .eq('char_id', myCharId)
        .eq('phase',   0) /* 소지금은 1부(phase=0) 기준 */
        .single();

    var money = (res.data && res.data.money) ? parseInt(res.data.money) : 0;
    display.innerText = money.toLocaleString() + ' G';
};

/**
 * 상점 아이템 목록을 렌더링합니다.
 * Config.js의 window.shopItems 배열을 사용합니다.
 */
window.renderShop = function () {
    var container = document.getElementById('shop-items-container');
    if (!container) return;

    /*
     * 현재 탭에 맞는 아이템만 필터링합니다.
     * furniture 탭: type이 'furniture', 'wallpaper', 'floor'인 것
     * general 탭: 그 외 모든 것
     */
    var filteredItems = (window.shopItems || shopItems)
        .map(function (item, originalIndex) {
            return { item: item, originalIndex: originalIndex };
        })
        .filter(function (d) {
            var isFurnitureType = (d.item.type === 'furniture' || d.item.type === 'wallpaper' || d.item.type === 'floor');
            if (currentShopTab === 'general'   &&  isFurnitureType) return false;
            if (currentShopTab === 'furniture' && !isFurnitureType) return false;
            return true;
        });

    /* 페이지네이션 */
    var totalPages = Math.ceil(filteredItems.length / SHOP_ITEMS_PER_PAGE);
    if (currentShopPage > totalPages && totalPages > 0) currentShopPage = totalPages;

    var pageItems = filteredItems.slice(
        (currentShopPage - 1) * SHOP_ITEMS_PER_PAGE,
        currentShopPage * SHOP_ITEMS_PER_PAGE
    );

    /* 아이템 카드 HTML 생성 */
    container.innerHTML = pageItems.map(function (d) {
        var item = d.item;
        var idx  = d.originalIndex;
        return '<div class="shop-item-card">' +
            '<img src="' + item.img + '" class="shop-item-img" onerror="this.style.display=\'none\'">' +
            '<div class="shop-item-title">' + item.name + '</div>' +
            '<div class="shop-item-desc">'  + item.desc  + '</div>' +
            '<div class="shop-item-price">' + item.price.toLocaleString() + ' G</div>' +
            /* 수량 조절 버튼 */
            '<div class="shop-qty-control">' +
                '<button class="shop-qty-btn" onclick="shopQtyChange(' + idx + ',-1)">－</button>' +
                '<span   id="shop-qty-'   + idx + '" class="shop-qty-val">1</span>' +
                '<button class="shop-qty-btn" onclick="shopQtyChange(' + idx + ',+1)">＋</button>' +
            '</div>' +
            '<div class="shop-total-price" id="shop-total-' + idx + '">' + item.price.toLocaleString() + ' G</div>' +
            '<button class="btn-buy" onclick="buyItem(' + idx + ', this)">Purchase</button>' +
            '</div>';
    }).join('');

    /* 페이지네이션 버튼 */
    var pageEl = document.getElementById('shop-pagination-container');
    if (!pageEl) {
        pageEl = document.createElement('div');
        pageEl.id = 'shop-pagination-container';
        pageEl.style.cssText = 'display:flex; justify-content:center; gap:8px; margin-top:20px; width:100%;';
        container.parentNode.insertBefore(pageEl, container.nextSibling);
    }
    pageEl.innerHTML = (totalPages > 1)
        ? (function () {
            var s = '';
            for (var i = 1; i <= totalPages; i++) {
                s += '<button class="page-btn ' + (i === currentShopPage ? 'active' : '') +
                    '" onclick="changeShopPage(' + i + ')">' + i + '</button>';
            }
            return s;
          }())
        : '';
};

/**
 * 아이템을 구매합니다.
 * 소지금을 확인하고 차감 후 인벤토리에 추가합니다.
 * 인벤토리가 꽉 찼으면 우편함으로 발송합니다.
 */
window.buyItem = async function (idx, btn) {
    if (!currentUser) { alert('로그인이 필요합니다.'); return; }

    var myCharId = charOwners[currentUser.email];
    if (!myCharId) { alert('캐릭터 권한이 없습니다.'); return; }

    var item = (window.shopItems || shopItems)[idx];
    if (!item) return;

    /* 구매 수량 */
    var qtyEl    = document.getElementById('shop-qty-' + idx);
    var qty      = parseInt((qtyEl && qtyEl.innerText) || '1', 10);
    var totalCost = item.price * qty;

    /* 소지금 확인 */
    var checkRes = await supabaseClient
        .from('character_profiles')
        .select('money')
        .eq('char_id', myCharId)
        .eq('phase',   0)
        .single();

    var checkMoney = (checkRes.data && checkRes.data.money)
        ? parseInt(String(checkRes.data.money).replace(/,/g, ''), 10)
        : 0;

    if (checkMoney < totalCost) {
        alert('소지금이 부족합니다!\n필요: ' + totalCost.toLocaleString() + ' G / 보유: ' + checkMoney.toLocaleString() + ' G');
        return;
    }

    if (!confirm('[' + item.name + '] × ' + qty + '개\n합계: ' + totalCost.toLocaleString() + ' G\n구매하시겠습니까?')) return;

    var originalText = btn.innerText;
    btn.innerText = 'Processing...';
    btn.disabled  = true;

    try {
        /* 최신 인벤토리 & 소지금 재조회 */
        var fetchRes = await supabaseClient
            .from('character_profiles')
            .select('money, inventory, furniture_inventory, mailbox')
            .eq('char_id', myCharId)
            .eq('phase',   0)
            .single();

        if (fetchRes.error) throw fetchRes.error;

        var profile = fetchRes.data;
        var money   = (profile && profile.money)
            ? parseInt(String(profile.money).replace(/,/g, ''), 10)
            : 0;

        /* 가구류는 furniture_inventory에, 나머지는 inventory에 넣기 */
        var isFurnitureType = (item.type === 'furniture' || item.type === 'wallpaper' || item.type === 'floor');
        var targetCol       = isFurnitureType ? 'furniture_inventory' : 'inventory';

        var targetArr = [];
        var rawInv    = (profile && profile[targetCol]) || [];
        if (typeof rawInv === 'string') { try { targetArr = JSON.parse(rawInv); } catch(e) { targetArr = []; } }
        else if (Array.isArray(rawInv)) targetArr = rawInv.slice();
        while (targetArr.length < 20) targetArr.push(null);

        /* 우편함 로드 */
        var mailArr = [];
        if (profile && profile.mailbox) {
            try { mailArr = typeof profile.mailbox === 'string' ? JSON.parse(profile.mailbox) : profile.mailbox; }
            catch(e) { mailArr = []; }
        }
        if (!Array.isArray(mailArr)) mailArr = [];

        /* 소지금 차감 */
        money -= totalCost;

        /* 같은 이름 아이템이 있으면 수량만 증가 */
        var existing = null;
        for (var i = 0; i < targetArr.length; i++) {
            if (targetArr[i] && targetArr[i].name === item.name) {
                existing = targetArr[i];
                break;
            }
        }

        var inInv = 0, inMail = 0;

        if (existing) {
            existing.count = (existing.count || 1) + qty;
            inInv += qty;
        } else {
            /* 빈 슬롯 찾기 */
            var emptyIdx = -1;
            for (var j = 0; j < targetArr.length; j++) {
                if (targetArr[j] === null || targetArr[j] === '') { emptyIdx = j; break; }
            }

            /* 새 아이템 객체 생성 */
            var newItem = { name: item.name, desc: item.desc || '', img: item.img || '', type: item.type || 'item', count: qty };

            if (emptyIdx !== -1) {
                targetArr[emptyIdx] = newItem;
                inInv += qty;
            } else {
                /* 인벤토리 꽉 참 → 우편함으로 전송 */
                mailArr.push(newItem);
                inMail += qty;
            }
        }

        /* DB 업데이트 */
        var updatePayload    = { money: money };
        updatePayload[targetCol] = targetArr;
        if (inMail > 0) updatePayload.mailbox = mailArr;

        currentEditingId    = myCharId;
        currentEditingPhase = 0;
        var upsertRes = await upsertProfileData(updatePayload);
        if (upsertRes && upsertRes.error) throw upsertRes.error;

        /* 결과 알림 */
        var msg = '[' + item.name + '] ' + qty + '개 구매 완료!\n잔액: ' + money.toLocaleString() + ' G';
        if (inMail > 0) msg += '\n(인벤토리 꽉 참 — 우편함으로 전달됨)';
        alert(msg);

        /* 수량 초기화 */
        if (qtyEl) qtyEl.innerText = '1';
        var totalEl = document.getElementById('shop-total-' + idx);
        if (totalEl) totalEl.innerText = item.price.toLocaleString() + ' G';

        if (typeof window.updateShopMoneyDisplay === 'function') await window.updateShopMoneyDisplay();
        if (typeof loadCharacterData             === 'function') await loadCharacterData();

    } catch (err) {
        console.error('구매 오류:', err);
        alert('결제 처리 중 오류가 발생했습니다.');
    } finally {
        btn.innerText = originalText;
        btn.disabled  = false;
    }
};


/* ================================================================= */
/* 3. 캘린더 (월별 일정 관리)                                          */
/* ================================================================= */

/**
 * 캘린더를 초기화하고 렌더링합니다.
 * 페이지 로드 시 window.load 이벤트에서 호출됩니다.
 */
async function buildCalendar() {
    var el = document.getElementById('calendar');
    if (!el) return;

    /* 현재 표시 중인 연월 (날짜 탐색 시 업데이트) */
    var current = new Date();

    /**
     * 캘린더를 다시 그리는 내부 함수.
     * DB에서 이벤트를 조회하고 HTML을 생성합니다.
     */
    async function render() {
        /* DB에서 calendar_events 테이블의 모든 이벤트 조회 */
        var res    = await supabaseClient.from('calendar_events').select('*');
        var events = {};
        if (res.data) {
            res.data.forEach(function (d) {
                /* 날짜 문자열을 키로 사용: 'YYYY-MM-DD' → [제목, 내용] */
                events[d.event_date] = [d.title, d.description];
            });
        }

        var year  = current.getFullYear();
        var month = current.getMonth();    /* 0~11 */
        var today = new Date();

        /* 이번 달 1일의 요일 (0=일, 1=월, ..., 6=토) */
        var firstDay    = new Date(year, month, 1).getDay();
        /* 이번 달의 마지막 날 */
        var lastDate    = new Date(year, month + 1, 0).getDate();

        /* 날짜 셀 HTML 생성 */
        var cells = '';

        /* 1일 이전의 빈 칸 */
        for (var i = 0; i < firstDay; i++) {
            cells += '<div class="cal-day empty"></div>';
        }

        /* 날짜 칸 */
        for (var d = 1; d <= lastDate; d++) {
            /* YYYY-MM-DD 형식의 날짜 문자열 */
            var dateStr = year + '-' +
                String(month + 1).padStart(2, '0') + '-' +
                String(d).padStart(2, '0');

            var ev = events[dateStr]; /* 이 날의 이벤트 */

            /* 오늘 날짜인지 확인 */
            var isToday = (d === today.getDate() && month === today.getMonth() && year === today.getFullYear());

            cells +=
                '<div class="cal-day' +
                    (isToday ? ' today' : '') +
                    (ev ? ' has-event' : '') + '"' +
                    ' onclick="addEvent(\'' + dateStr + '\', ' + !!ev + ')">' +
                    d +
                    /* 이벤트가 있으면 툴팁 표시 */
                    (ev
                        ? '<div class="cal-tooltip"><strong>' + ev[0] + '</strong><br>' + ev[1] + '</div>'
                        : '') +
                '</div>';
        }

        /* 캘린더 전체 HTML */
        el.innerHTML =
            '<div class="cal-header">' +
                '<div style="font-weight:700; color:#aaa;">' + year + '</div>' +
                '<div class="cal-nav">' +
                    '<button onclick="prevMonth()" title="이전 달">&lt;</button>' +
                    '<span style="color:#888; font-weight:700; min-width:30px; text-align:center;">' + (month + 1) + '月</span>' +
                    '<button onclick="nextMonth()" title="다음 달">&gt;</button>' +
                '</div>' +
            '</div>' +
            '<div class="cal-grid">' +
                /* 요일 헤더 */
                ['S','M','T','W','T','F','S'].map(function (d) {
                    return '<div class="cal-dow">' + d + '</div>';
                }).join('') +
                cells +
            '</div>';
    }

    /* 이전/다음 달 이동 함수 */
    window.prevMonth  = function () { current = new Date(current.getFullYear(), current.getMonth() - 1, 1); render(); };
    window.nextMonth  = function () { current = new Date(current.getFullYear(), current.getMonth() + 1, 1); render(); };

    /**
     * 날짜를 클릭하면 이벤트를 추가하거나 삭제합니다.
     *
     * 매개변수:
     *   dateStr  : 클릭한 날짜 문자열 ('YYYY-MM-DD')
     *   hasEvent : 이미 이벤트가 있는 날짜인지 여부
     */
    window.addEvent = async function (dateStr, hasEvent) {
        if (hasEvent) {
            /* 이미 이벤트가 있으면 삭제 여부 확인 */
            await window.deleteEvent(dateStr);
            return;
        }
        /* 새 이벤트 추가 */
        var title = prompt('일정 제목:');
        if (!title) return;
        var desc  = prompt('일정 내용:');

        var res = await supabaseClient.from('calendar_events').insert([{
            event_date:  dateStr,
            title:       title,
            description: desc || ''
        }]);

        if (res.error) alert('저장 실패');
        else           buildCalendar(); /* 캘린더 새로고침 */
    };

    window.deleteEvent = async function (dateStr) {
        if (confirm('이 일정을 삭제하시겠습니까?')) {
            var res = await supabaseClient.from('calendar_events').delete().eq('event_date', dateStr);
            if (res.error) alert('삭제 실패');
            else           buildCalendar();
        }
    };

    render(); /* 초기 렌더링 */
}


/* ================================================================= */
/* 4. 미니게임                                                        */
/* ================================================================= */

/* ── 공통: 소지금 표시 업데이트 ── */

/**
 * DB에서 최신 소지금을 가져와 미니게임 화면에 표시합니다.
 */
async function _refreshMiniGameMoneyDisplay() {
    if (!currentUser) return;

    var myCharId = charOwners[currentUser.email];
    if (!myCharId) return;

    /* DB에서 최신 소지금 조회 (콤마 포함 문자열도 처리) */
    var res = await supabaseClient
        .from('character_profiles')
        .select('money')
        .eq('char_id', myCharId)
        .eq('phase',   0)
        .single();

    var money = 0;
    if (res.data && res.data.money) {
        money = parseInt(String(res.data.money).replace(/,/g, ''), 10) || 0;
    }

    window.currentMoney = money; /* 전역 변수 동기화 */

    var el = document.getElementById('minigame-my-money');
    if (el) el.innerText = money.toLocaleString() + ' G';
}

/* updateMiniGameMoneyDisplay 를 별칭으로도 사용 가능하도록 */
window.updateMiniGameMoneyDisplay = _refreshMiniGameMoneyDisplay;

/**
 * 미니게임 탭을 전환합니다.
 *
 * 매개변수:
 *   btn : 클릭된 탭 버튼
 *   idx : 표시할 슬라이드 인덱스 (0=동전, 1=야바위, 2=사냥)
 */
window.changeMiniGame = function (btn, idx) {
    /* 탭 버튼 active 상태 변경 */
    var sec = document.getElementById('MiniGames');
    sec.querySelectorAll('.phase-btn').forEach(function (t) { t.classList.remove('active'); });
    sec.querySelectorAll('.mg-slide').forEach(function (s) { s.classList.remove('active'); });
    btn.classList.add('active');
    sec.querySelectorAll('.mg-slide')[idx].classList.add('active');

    /* 야바위 탭이면 컵 위치 초기화 */
    if (idx === 1) initShellPositions();

    _refreshMiniGameMoneyDisplay();
};


/* ── 미니게임 1: 동전 던지기 ── */

var isTossing = false; /* 동전이 돌아가는 동안 중복 클릭 방지 */

/**
 * 동전 던지기 게임을 실행합니다.
 * 앞면/뒷면을 맞추면 배팅 금액을 얻고, 틀리면 잃습니다.
 *
 * 매개변수:
 *   guess : 'heads'(앞면) or 'tails'(뒷면)
 */
window.playCoinToss = async function (guess) {
    if (isTossing) return; /* 진행 중이면 무시 */
    if (!currentUser) { alert('로그인이 필요합니다.'); return; }

    var myCharId = charOwners[currentUser.email];
    if (!myCharId) { alert('캐릭터 권한이 없습니다.'); return; }

    /* 배팅 금액 확인 */
    var bet = parseInt(document.getElementById('cointoss-bet').value);
    if (isNaN(bet) || bet <= 0) { alert('1 G 이상 입력해주세요.'); return; }

    /* 최신 소지금 확인 */
    var dbRes   = await supabaseClient
        .from('character_profiles').select('money')
        .eq('char_id', myCharId).eq('phase', 0).single();
    var dbMoney = dbRes.data && dbRes.data.money
        ? parseInt(String(dbRes.data.money).replace(/,/g, ''), 10)
        : 0;

    if (bet > dbMoney) {
        alert('소지금이 부족합니다! (보유: ' + dbMoney.toLocaleString() + ' G)');
        return;
    }

    isTossing = true;

    /* 버튼 비활성화 */
    document.getElementById('btn-guess-heads').disabled = true;
    document.getElementById('btn-guess-tails').disabled = true;

    /* 동전 회전 애니메이션 시작 */
    var coin       = document.getElementById('coin-element');
    var resultText = document.getElementById('cointoss-result');
    resultText.innerText   = 'Flipping...';
    resultText.style.color = '#888';
    coin.innerText         = '';
    coin.classList.remove('coin-flipping');
    void coin.offsetWidth;               /* 리플로우 강제 → 애니메이션 재시작 */
    coin.classList.add('coin-flipping');

    /* 1.5초 후 결과 처리 (애니메이션이 끝나는 시간과 맞춤) */
    setTimeout(async function () {
        try {
            /* 무작위로 앞/뒤 결정 */
            var outcome = Math.random() < 0.5 ? 'heads' : 'tails';

            /* 동전 표시 */
            coin.innerText = (outcome === 'heads') ? '앞' : '뒤';
            coin.className = (outcome === 'heads') ? 'coin' : 'coin silver';

            /* 최신 소지금 재조회 */
            var freshRes   = await supabaseClient
                .from('character_profiles').select('money')
                .eq('char_id', myCharId).eq('phase', 0).single();
            var freshMoney = freshRes.data && freshRes.data.money
                ? parseInt(String(freshRes.data.money).replace(/,/g, ''), 10)
                : 0;

            var newMoney;
            if (guess === outcome) {
                /* 정답 */
                newMoney               = freshMoney + bet;
                resultText.innerText   = '정답! +' + bet.toLocaleString() + ' G 획득!';
                resultText.style.color = '#aaa';
            } else {
                /* 오답 */
                newMoney               = freshMoney - bet;
                resultText.innerText   = '실패... -' + bet.toLocaleString() + ' G';
                resultText.style.color = '#666';
            }

            /* DB 저장 */
            currentEditingId    = myCharId;
            currentEditingPhase = 0;
            var saveRes = await upsertProfileData({ money: newMoney });

            if (!saveRes || !saveRes.error) {
                window.currentMoney = newMoney;
                await _refreshMiniGameMoneyDisplay();
                if (typeof loadCharacterData === 'function') await loadCharacterData();
            }
        } finally {
            /* 버튼 다시 활성화 */
            isTossing = false;
            document.getElementById('btn-guess-heads').disabled = false;
            document.getElementById('btn-guess-tails').disabled = false;
            coin.classList.remove('coin-flipping');
        }
    }, 1500);
};


/* ── 미니게임 2: 야바위 (Shell Game) ── */

var shellState      = 'idle';   /* 'idle' | 'shuffling' | 'waiting' | 'resolving' */
var shellWinningCup = -1;       /* 공이 있는 컵 인덱스 (0,1,2) */
var shellBetAmount  = 0;        /* 이번 게임 배팅 금액 */
var cupPositions    = [0,1,2];  /* 각 컵 래퍼의 논리적 위치 */
var CUP_X           = [0,120,240]; /* 각 위치의 픽셀 X 좌표 */

/**
 * 야바위 컵 초기 위치를 설정합니다.
 * 창 크기 변경 시에도 자동으로 재계산됩니다.
 */
function initShellPositions() {
    var board = document.getElementById('shell-board');
    if (!board) return;

    var cw   = board.clientWidth;
    var cup0 = document.getElementById('cup-wrap-0');
    var cupW = cup0 ? cup0.clientWidth : 75;
    var gap  = (cw - cupW * 3) / 2;

    CUP_X        = [0, cupW + gap, (cupW + gap) * 2];
    cupPositions = [0, 1, 2];

    /* 컵들을 초기 위치로 복귀 */
    [0, 1, 2].forEach(function (i) {
        var el = document.getElementById('cup-wrap-' + i);
        if (el) el.style.transform = 'translate(' + CUP_X[i] + 'px, 0)';
    });
}
window.addEventListener('resize', initShellPositions);

/**
 * 야바위 게임을 시작합니다.
 */
window.startShellGame = async function () {
    if (shellState !== 'idle') return; /* 진행 중이면 무시 */
    if (!currentUser) { alert('로그인이 필요합니다.'); return; }

    var myCharId = charOwners[currentUser.email];
    if (!myCharId) { alert('캐릭터 권한이 없습니다.'); return; }

    var bet = parseInt(document.getElementById('shell-bet').value);
    if (isNaN(bet) || bet <= 0) { alert('1 G 이상 입력해주세요.'); return; }

    /* 소지금 확인 */
    var dbRes   = await supabaseClient
        .from('character_profiles').select('money')
        .eq('char_id', myCharId).eq('phase', 0).single();
    var dbMoney = dbRes.data && dbRes.data.money
        ? parseInt(String(dbRes.data.money).replace(/,/g, ''), 10)
        : 0;

    if (bet > dbMoney) {
        alert('소지금이 부족합니다! (보유: ' + dbMoney.toLocaleString() + ' G)');
        return;
    }

    shellBetAmount = bet;
    shellState     = 'shuffling';

    var resultText = document.getElementById('shell-result');
    var cups       = document.querySelectorAll('.shell-cup');
    var balls      = document.querySelectorAll('.shell-ball');
    var wrappers   = [0, 1, 2].map(function (i) {
        return document.getElementById('cup-wrap-' + i);
    });

    /* 초기화 */
    cups.forEach(function (c)  { c.classList.remove('revealed'); });
    balls.forEach(function (b) { b.classList.remove('winner'); });

    /* 무작위로 공 위치 결정 */
    shellWinningCup = Math.floor(Math.random() * 3);
    document.getElementById('shell-ball-' + shellWinningCup).classList.add('winner');

    /* 공 보여주기 (잠깐) */
    resultText.innerText  = '공을 잘 보세요!';
    resultText.style.color = '#aaa';
    document.getElementById('cup-' + shellWinningCup).classList.add('revealed');

    await new Promise(function (r) { setTimeout(r, 1200); });
    document.getElementById('cup-' + shellWinningCup).classList.remove('revealed');
    await new Promise(function (r) { setTimeout(r, 500); });

    /* ── 컵 섞기 애니메이션 ── */
    resultText.innerText = 'Shuffling...';
    resultText.style.color = '#777';

    var shuffleCount = 22; /* 셔플 횟수 */
    var speed        = 350; /* 초기 속도 (ms) */

    for (var i = 0; i < shuffleCount; i++) {
        /* 횟수가 늘수록 점점 빠르게 */
        if (i > 5)  speed = 200;
        if (i > 10) speed = 120;
        if (i > 15) speed = 70;

        wrappers.forEach(function (w) {
            w.style.transition = 'transform ' + speed + 'ms ease-in-out';
        });

        /* 무작위 두 위치 선택해서 교환 */
        var posA = Math.floor(Math.random() * 3);
        var posB = Math.floor(Math.random() * 3);
        while (posA === posB) posB = Math.floor(Math.random() * 3);

        var cupIdxA = cupPositions.indexOf(posA);
        var cupIdxB = cupPositions.indexOf(posB);

        /* 위치 교환 */
        cupPositions[cupIdxA] = posB;
        cupPositions[cupIdxB] = posA;

        /* 위로 올렸다가 이동 (자연스러운 느낌) */
        wrappers[cupIdxA].style.zIndex    = 10;
        wrappers[cupIdxB].style.zIndex    = 5;
        wrappers[cupIdxA].style.transform = 'translate(' + CUP_X[posB] + 'px, -18px)';
        wrappers[cupIdxB].style.transform = 'translate(' + CUP_X[posA] + 'px, 18px)';
        await new Promise(function (r) { setTimeout(r, speed / 2); });
        wrappers[cupIdxA].style.transform = 'translate(' + CUP_X[posB] + 'px, 0)';
        wrappers[cupIdxB].style.transform = 'translate(' + CUP_X[posA] + 'px, 0)';
        await new Promise(function (r) { setTimeout(r, speed / 2 + 8); });
    }

    /* 섞기 완료 */
    resultText.innerText  = '어디에 있을까요? 클릭하세요!';
    resultText.style.color = '#aaa';
    shellState = 'waiting'; /* 플레이어 입력 대기 상태 */
};

/**
 * 플레이어가 컵을 선택합니다.
 *
 * 매개변수:
 *   selectedCupIdx : 클릭한 컵 인덱스 (0,1,2)
 */
window.guessShellCup = async function (selectedCupIdx) {
    if (shellState !== 'waiting') return; /* 대기 상태가 아니면 무시 */
    shellState = 'resolving';

    var myCharId   = charOwners[currentUser.email];
    var resultText = document.getElementById('shell-result');
    var cups       = document.querySelectorAll('.shell-cup');

    /* 모든 컵 뒤집기 */
    cups.forEach(function (c) { c.classList.add('revealed'); });

    /* 소지금 차감 + 결과에 따라 지급 */
    var dbRes   = await supabaseClient
        .from('character_profiles').select('money')
        .eq('char_id', myCharId).eq('phase', 0).single();
    var dbMoney = dbRes.data && dbRes.data.money
        ? parseInt(String(dbRes.data.money).replace(/,/g, ''), 10)
        : 0;

    dbMoney -= shellBetAmount; /* 배팅 금액 차감 */

    if (selectedCupIdx === shellWinningCup) {
        /* 정답: 3배 지급 */
        var winAmount  = shellBetAmount * 3;
        dbMoney       += winAmount;
        resultText.innerText  = '정답! +' + winAmount.toLocaleString() + ' G!';
        resultText.style.color = '#aaa';
    } else {
        resultText.innerText  = '꽝! 다시 도전해보세요.';
        resultText.style.color = '#666';
    }

    /* DB 저장 */
    currentEditingId    = myCharId;
    currentEditingPhase = 0;
    await upsertProfileData({ money: dbMoney });
    window.currentMoney = dbMoney;
    await _refreshMiniGameMoneyDisplay();
    if (typeof loadCharacterData === 'function') await loadCharacterData();

    /* 3초 후 초기화 */
    setTimeout(function () {
        shellState            = 'idle';
        resultText.innerText  = '배팅 후 게임을 시작하세요!';
        resultText.style.color = '#666';
        cups.forEach(function (c) { c.classList.remove('revealed'); });
    }, 3000);
};


/* ── 미니게임 3: 사냥터 (Hunting) ── */

var huntScore          = 0;     /* 이번 게임에서 잡은 마리 수 */
var huntMoneyEarned    = 0;     /* 이번 게임에서 획득한 금액 */
var huntTimer          = 0;     /* 남은 시간 (초) */
var huntInterval       = null;  /* 1초마다 타이머 감소 */
var huntSpawnInterval  = null;  /* 사냥감 생성 인터벌 */

/**
 * 사냥터 게임을 시작합니다.
 * 15초 동안 클릭 가능한 동물이 나타납니다.
 */
window.startHuntingGame = function () {
    if (!currentUser) { alert('로그인이 필요합니다.'); return; }

    var myCharId = charOwners[currentUser.email];
    if (!myCharId) { alert('캐릭터 권한이 없습니다.'); return; }

    /* 진행 중인 인터벌 정리 */
    if (huntInterval)      clearInterval(huntInterval);
    if (huntSpawnInterval) clearInterval(huntSpawnInterval);

    var btn  = document.getElementById('btn-start-hunt');
    var area = document.getElementById('hunt-area');

    btn.disabled  = true;
    btn.innerText = 'Hunting...';

    /* 초기화 */
    huntScore       = 0;
    huntMoneyEarned = 0;
    huntTimer       = 15; /* ✏️  게임 시간(초)을 바꾸고 싶으면 이 숫자를 수정하세요 */
    area.innerHTML  = '';

    document.getElementById('hunt-score').innerText = huntMoneyEarned;
    document.getElementById('hunt-timer').innerText = huntTimer;

    /* 1초마다 타이머 감소 */
    huntInterval = setInterval(function () {
        huntTimer--;
        document.getElementById('hunt-timer').innerText = huntTimer;
        if (huntTimer <= 0) {
            endHuntingGame(myCharId); /* 시간 종료 */
        }
    }, 1000);

    /* 0.2초 후 첫 사냥감 생성, 이후 0.6초마다 */
    setTimeout(function () {
        if (huntTimer > 0) spawnTarget(area);
        huntSpawnInterval = setInterval(function () {
            if (huntTimer > 0) spawnTarget(area);
        }, 600);
    }, 200);
};

/**
 * 사냥감(사슴 or 곰)을 무작위 위치에 생성합니다.
 *
 * 매개변수:
 *   area : 사냥터 div 요소
 */
function spawnTarget(area) {
    if (huntTimer <= 0) return;

    /* ✏️  곰이 나올 확률(기본 20%)과 보상을 조절하세요 */
    var isBear  = (Math.random() < 0.2);  /* 20% 확률로 곰 */
    var size    = isBear ? 80 : 60;
    var reward  = isBear ? 50 : 10;       /* ✏️  보상 금액 */
    var emoji   = isBear ? '🐻' : '🦌';
    var lifeMs  = isBear ? 1400 : 1000;   /* 화면에 머무는 시간 (ms) */

    var areaW = area.clientWidth  || 600;
    var areaH = area.clientHeight || 340;

    var target       = document.createElement('div');
    target.className = 'hunt-target ' + (isBear ? 'bear' : 'deer');
    target.textContent = emoji;
    target.style.left = (10 + Math.floor(Math.random() * Math.max(10, areaW - size - 10))) + 'px';
    target.style.top  = (10 + Math.floor(Math.random() * Math.max(10, areaH - size - 10))) + 'px';

    /* 클릭 시 점수 획득 */
    target.onclick = function () {
        if (target.classList.contains('hit')) return;
        target.classList.add('hit');
        target.textContent = '+' + reward + 'G';
        huntScore++;
        huntMoneyEarned += reward;
        document.getElementById('hunt-score').innerText = huntMoneyEarned;
        setTimeout(function () { if (area.contains(target)) target.remove(); }, 350);
    };

    area.appendChild(target);

    /* 시간이 지나면 자동 제거 */
    setTimeout(function () {
        if (area.contains(target) && !target.classList.contains('hit')) target.remove();
    }, lifeMs);
}

/**
 * 사냥 게임을 종료하고 보상을 지급합니다.
 */
async function endHuntingGame(myCharId) {
    clearInterval(huntInterval);
    clearInterval(huntSpawnInterval);
    huntInterval      = null;
    huntSpawnInterval = null;

    var area = document.getElementById('hunt-area');
    area.innerHTML =
        '<div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);' +
        'color:#aaa; font-size:1.3rem; font-weight:bold; background:rgba(0,0,0,0.7);' +
        'padding:10px 20px; border-radius:8px;">Game Over!</div>';

    var btn = document.getElementById('btn-start-hunt');
    alert('사냥 종료!\n총 ' + huntScore + '마리 → ' + huntMoneyEarned.toLocaleString() + ' G 획득');

    /* 보상이 있으면 DB에 저장 */
    if (huntMoneyEarned > 0) {
        btn.innerText = 'Claiming reward...';

        /* 최신 소지금 조회 후 더하기 */
        var dbRes   = await supabaseClient
            .from('character_profiles').select('money')
            .eq('char_id', myCharId).eq('phase', 0).single();
        var dbMoney = dbRes.data && dbRes.data.money
            ? parseInt(String(dbRes.data.money).replace(/,/g, ''), 10)
            : 0;

        currentEditingId    = myCharId;
        currentEditingPhase = 0;
        var res = await upsertProfileData({ money: dbMoney + huntMoneyEarned });

        if (!res || !res.error) {
            window.currentMoney = dbMoney + huntMoneyEarned;
            await _refreshMiniGameMoneyDisplay();
            if (typeof loadCharacterData === 'function') await loadCharacterData();
        }
    }

    btn.innerText = 'Start Hunting';
    btn.disabled  = false;
}


/* ================================================================= */
/* 5. 탭 전환 & 전역 타임라인(Phase) 동기화                            */
/* ================================================================= */

/**
 * 글로벌 타임라인(챕터)을 변경합니다.
 * 사이드바의 드롭다운에서 호출됩니다.
 * Features.js의 setGlobalPhase는 index.html 인라인 스크립트에서도 정의됩니다.
 * 여기서는 Supabase에 저장하는 확장 버전입니다.
 *
 * 매개변수:
 *   val : 새 챕터 값 ('0'~'3')
 */
window.setGlobalPhase = async function (val) {
    var newPhase = parseInt(val, 10);

    /* 관리자만 전역 타임라인 변경 가능 */
    if (typeof window.isAdmin === 'function' && !window.isAdmin()) {
        alert('타임라인 변경 권한이 없습니다.');
        var selectBox = document.getElementById('global-main-phase');
        if (selectBox) selectBox.value = window.globalMainPhase || 0;
        return;
    }

    /* Supabase system_settings 테이블에 저장 */
    if (supabaseClient) {
        var res = await supabaseClient
            .from('system_settings')
            .update({ current_phase: newPhase })
            .eq('id', 1);

        if (res.error) {
            /* 테이블이 없을 경우 무시하고 로컬에만 적용 */
            console.warn('system_settings 업데이트 실패:', res.error.message);
        }
    }

    /* 로컬 변수 업데이트 & 화면 동기화 */
    window.globalMainPhase = newPhase;
    if (typeof window.syncAllTabs === 'function') {
        window.syncAllTabs(newPhase);
    } else {
        /* syncAllTabs가 없으면 직접 탭 전환 */
        document.querySelectorAll('.phase-tabs').forEach(function (tabContainer) {
            var buttons = tabContainer.querySelectorAll('.phase-btn');
            if (buttons.length > 0 && buttons[0].innerText.includes('Chapter')) {
                if (buttons[newPhase]) buttons[newPhase].click();
            }
        });
    }

    alert('타임라인이 Chapter ' + (newPhase + 1) + ' 로 변경되었습니다.');
};

/**
 * 모든 탭을 지정한 챕터로 동기화합니다.
 * 다른 사람이 타임라인을 바꿨을 때 실시간으로 화면을 업데이트하는 데 사용합니다.
 */
window.syncAllTabs = function (phase) {
    window.globalMainPhase = phase;

    /* 'Chapter 1~4' 버튼이 있는 탭 컨테이너를 모두 찾아 전환 */
    document.querySelectorAll('.phase-tabs').forEach(function (tabContainer) {
        var buttons = tabContainer.querySelectorAll('.phase-btn');
        if (buttons.length >= phase + 1 &&
            buttons[0] && buttons[0].innerText.includes('Chapter')) {
            if (typeof window.changePhase === 'function' && buttons[phase]) {
                window.changePhase(buttons[phase], phase);
            }
        }
    });
};

/* ── 실시간 타임라인 동기화 (Supabase Realtime) ── */
/*
 * 관리자가 타임라인을 바꾸면 system_settings 테이블이 업데이트됩니다.
 * 이 Realtime 구독이 변경을 감지해서 모든 접속자의 화면을 자동으로 동기화합니다.
 */
if (typeof supabaseClient !== 'undefined' && supabaseClient) {
    supabaseClient
        .channel('phase_sync_channel')
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'system_settings' },
            function (payload) {
                /* DB 변경 감지 → 화면 동기화 */
                var syncedPhase = payload.new.current_phase;
                var selectBox   = document.getElementById('global-main-phase');
                if (selectBox) selectBox.value = syncedPhase;
                window.syncAllTabs(syncedPhase);
            }
        )
        .subscribe();
}
