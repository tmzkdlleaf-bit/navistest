/* ================================================================= */
/*  Map.js — 전체 인물 관계도 시스템                                   */
/*                                                                   */
/*  이 파일이 담당하는 일:                                             */
/*  1. DB에서 관계도 데이터 로드 & 렌더링                              */
/*  2. 진영(그룹) 배경 다각형 그리기                                   */
/*  3. SVG 관계선 & 배지 위치 동기화                                   */
/*  4. 노드(인물) & 배지 드래그 이동                                   */
/*  5. 편집 모드 ON/OFF 토글                                          */
/*  6. 관계선 추가/수정/삭제 에디터                                    */
/*  7. 노드(인물) 추가/수정/삭제 에디터                                */
/*  8. 관계도 데이터 DB 저장                                           */
/*                                                                   */
/*  ✏️  수정 포인트:                                                   */
/*  - 진영 기본 색상: defaultGroupConfig 객체를 수정하세요             */
/*  - 초기 노드/선 위치: getInitialMapData() 함수를 수정하세요          */
/* ================================================================= */


/* ─────────────────────────────────────────────────────────────────
   전역 상태 변수
───────────────────────────────────────────────────────────────── */

/* DB에서 불러온 관계도 전체 데이터 (노드 위치, 관계선, 커스텀 인물 등) */
let staticMapData   = { nodes: {}, edges: [], customNodes: [], customGroups: {} };

/* 현재 편집 모드 여부 (true이면 드래그로 노드를 움직일 수 있음) */
let isMapEditMode   = false;

/* 현재 보고 있는 챕터 인덱스 (0=Chapter 1, 1=Chapter 2, ...) */
let currentMapPhase = 0;

/*
 * 진영(그룹) 기본 색상 설정
 *
 * ✏️  캠페인에 맞게 진영 이름과 색상을 바꾸세요.
 * 키: Config.js charData의 title 필드와 동일해야 합니다.
 * color: 진영 배경 채우기 색 (rgba 권장)
 * border: 진영 테두리 색
 * name: 화면에 표시할 진영 이름
 */
const defaultGroupConfig = {
    'A그룹': { color: 'rgba(200,200,200,0.05)', border: '#aaaaaa', name: 'A그룹' },
    'B그룹': { color: 'rgba(120,120,120,0.05)', border: '#777777', name: 'B그룹' },
};


/* ─────────────────────────────────────────────────────────────────
   헬퍼 함수
───────────────────────────────────────────────────────────────── */

/**
 * charData(Config.js)와 사용자가 추가한 커스텀 노드를 합친 배열을 반환합니다.
 * 관계도에 표시할 전체 인물 목록입니다.
 */
function getMergedCharData() {
    return [...charData, ...(staticMapData.customNodes || [])];
}

/**
 * 기본 진영 설정과 사용자가 추가한 커스텀 진영을 합친 객체를 반환합니다.
 */
function getMergedGroupConfig() {
    return { ...defaultGroupConfig, ...(staticMapData.customGroups || {}) };
}

/**
 * DB에 데이터가 없을 때 사용하는 초기 관계도 데이터입니다.
 *
 * ✏️  처음 배포할 때 여기서 노드 위치와 관계선을 설정하세요.
 *
 * nodes : { '캐릭터id': { x: %, y: % } } — 위치는 % 단위 (0~100)
 * edges : 관계선 배열
 *   from/to : charData의 id (예: '가나', '다라')
 *   text    : 관계 이름 (예: '동료', '적대')
 *   color   : 선 색상
 *   isDashed: true이면 점선
 *   pos     : 배지 위치 비율 (0=시작점, 1=끝점, 0.5=중간)
 */
function getInitialMapData() {
    return {
        nodes: {
            /* ✏️  캐릭터 id와 초기 위치를 맞게 수정하세요 */
            '가나': { x: 30, y: 30 },
            '다라': { x: 70, y: 30 },
            '마바': { x: 30, y: 70 },
            '사아': { x: 70, y: 70 },
        },
        edges: [
            /* ✏️  관계선을 여기에 추가/수정하세요 */
            { from: '가나', to: '다라', text: '동료',   color: '#aaaaaa', isDashed: false, pos: 0.5 },
            { from: '가나', to: '마바', text: '적대',   color: '#ff6666', isDashed: false, pos: 0.5 },
            { from: '다라', to: '사아', text: '혈연',   color: '#66aa66', isDashed: true,  pos: 0.5 },
            { from: '마바', to: '사아', text: '동맹',   color: '#6688cc', isDashed: false, pos: 0.5 },
        ],
        customNodes:  [], /* 편집 모드에서 추가한 커스텀 인물 */
        customGroups: {}, /* 편집 모드에서 추가한 커스텀 진영 */
    };
}


/* ─────────────────────────────────────────────────────────────────
   1. 데이터 로드 & 렌더링
───────────────────────────────────────────────────────────────── */

/**
 * DB에서 현재 챕터의 관계도 데이터를 불러와서 화면에 그립니다.
 * Relations 탭이 열리거나 챕터를 전환할 때 호출됩니다.
 */
async function loadAndDrawMap() {
    if (!supabaseClient) {
        /* DB 연결이 없으면 초기 데이터로 표시 */
        staticMapData = getInitialMapData();
        renderStaticMap();
        return;
    }

    try {
        /*
         * character_profiles 테이블에 'global_static_map'이라는 특수 char_id로
         * 관계도 전체 데이터를 JSON 문자열로 저장합니다.
         * phase 컬럼으로 챕터별로 구분합니다.
         */
        const { data } = await supabaseClient
            .from('character_profiles')
            .select('relationships')
            .eq('char_id', 'global_static_map')
            .eq('phase',   currentMapPhase)
            .single();

        staticMapData = (data && data.relationships)
            ? JSON.parse(data.relationships)
            : getInitialMapData();

    } catch (e) {
        /* 조회 실패 시 초기 데이터 사용 */
        staticMapData = getInitialMapData();
    }

    /* 필수 필드 누락 방지 */
    if (!staticMapData.customNodes)  staticMapData.customNodes  = [];
    if (!staticMapData.customGroups) staticMapData.customGroups = {};

    /* 관계선에 pos 필드가 없으면 기본값 0.5 추가 */
    staticMapData.edges.forEach(function (e) {
        if (e.pos === undefined) e.pos = 0.5;
    });

    /* charData에는 있지만 nodes에는 없는 캐릭터가 있으면 기본 위치 추가 */
    getMergedCharData().forEach(function (c) {
        if (!staticMapData.nodes[c.id]) {
            staticMapData.nodes[c.id] = { x: 50, y: 50 };
        }
    });

    renderStaticMap();
}


/* ─────────────────────────────────────────────────────────────────
   2. 진영 배경 그리기
───────────────────────────────────────────────────────────────── */

/**
 * 같은 진영(title)의 노드들을 감싸는 배경 다각형을 그립니다.
 * 노드를 움직일 때마다 자동으로 다시 호출됩니다.
 */
function renderGroups() {
    const layer = document.getElementById('faction-groups-layer');
    if (!layer) return;

    let html = '';
    const currentGroups = getMergedGroupConfig();
    const currentChars  = getMergedCharData();

    for (const [groupTitle, config] of Object.entries(currentGroups)) {
        /* 이 진영에 속한 캐릭터 목록 */
        const members = currentChars.filter(function (c) { return c.title === groupTitle; });
        if (members.length === 0) continue;

        /* 멤버들의 위치를 기반으로 bounding box 계산 */
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        let hasNode = false;

        members.forEach(function (m) {
            const pos = staticMapData.nodes[m.id];
            if (!pos) return;
            minX = Math.min(minX, pos.x); maxX = Math.max(maxX, pos.x);
            minY = Math.min(minY, pos.y); maxY = Math.max(maxY, pos.y);
            hasNode = true;
        });

        if (!hasNode) continue;

        /* 노드들을 감싸는 사각형 + 패딩 */
        const pad = 65; /* 노드 주변 여백(px) */
        html += `
            <div class="faction-group"
                style="
                    left:   calc(${minX}% - ${pad}px);
                    top:    calc(${minY}% - ${pad}px);
                    width:  calc(${maxX - minX}% + ${pad * 2}px);
                    height: calc(${maxY - minY}% + ${pad * 2}px);
                    background-color: ${config.color};
                    border: 2px dashed ${config.border};
                ">
                <span class="faction-name" style="color:${config.border}; border-color:${config.border};">
                    ${config.name}
                </span>
            </div>`;
    }

    layer.innerHTML = html;
}


/* ─────────────────────────────────────────────────────────────────
   3. SVG 관계선 & 배지 위치 동기화
───────────────────────────────────────────────────────────────── */

/**
 * 관계선(SVG line)과 관계 배지(rel-label)의 위치를 최신 노드 위치에 맞게 업데이트합니다.
 * 노드를 드래그하거나 데이터가 로드된 후 호출됩니다.
 */
function updateDynamicPositions() {
    const svg = document.getElementById('map-svg-layer');
    if (!svg) return;

    let svgHTML = '';

    staticMapData.edges.forEach(function (edge, idx) {
        const n1 = staticMapData.nodes[edge.from]; /* 시작 노드 위치 */
        const n2 = staticMapData.nodes[edge.to];   /* 끝 노드 위치 */
        if (!n1 || !n2) return;

        /* SVG line 그리기 (실선 or 점선) */
        const dash = edge.isDashed ? 'stroke-dasharray="8, 6"' : '';
        svgHTML += `<line
            x1="${n1.x}%" y1="${n1.y}%"
            x2="${n2.x}%" y2="${n2.y}%"
            stroke="${edge.color}"
            stroke-width="2.5"
            ${dash}
            opacity="0.75"
        />`;

        /* 배지(rel-label) 위치 계산 */
        const badgeEl = document.querySelector(`.rel-label[data-idx="${idx}"]`);
        if (!badgeEl) return;

        /* pos 비율(0~1)로 선 위의 위치 보간 */
        const p  = edge.pos || 0.5;
        const bx = n1.x + (n2.x - n1.x) * p; /* x 보간 */
        const by = n1.y + (n2.y - n1.y) * p; /* y 보간 */

        /* 배지가 선과 평행하도록 회전 각도 계산 */
        const ratio = 10 / 16; /* SVG 컨테이너의 가로:세로 비율 보정 */
        const dx    = n2.x - n1.x;
        const dy    = (n2.y - n1.y) * ratio;
        let   angle = Math.atan2(dy, dx) * (180 / Math.PI);
        if (angle > 90 || angle < -90) angle += 180; /* 텍스트가 뒤집히지 않도록 */

        badgeEl.style.left      = `${bx}%`;
        badgeEl.style.top       = `${by}%`;
        badgeEl.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
    });

    svg.innerHTML = svgHTML;
}


/* ─────────────────────────────────────────────────────────────────
   4. 전체 렌더링
───────────────────────────────────────────────────────────────── */

/**
 * 노드, 관계선, 배지를 모두 다시 그립니다.
 * 데이터 변경(드래그, 추가, 삭제) 후 항상 호출됩니다.
 */
function renderStaticMap() {
    const nodesLayer = document.getElementById('static-nodes-layer');
    if (!nodesLayer) return;

    let html = '';
    const currentChars = getMergedCharData();

    /* 각 캐릭터 노드 HTML 생성 */
    currentChars.forEach(function (c) {
        const pos = staticMapData.nodes[c.id];
        if (!pos) return;

        /* 본인 캐릭터이면 'my-node' 클래스 추가 (강조 표시) */
        const isMyNode = (currentUser && charOwners[currentUser.email] === `char-${c.id}`)
            ? 'my-node' : '';

        /* DB에서 불러온 프로필 이미지 사용 (없으면 Config.js 기본 이미지) */
        const profile = allProfiles.find(function (p) {
            return p.char_id === `char-${c.id}` && p.phase === currentMapPhase;
        });
        const imgSrc = (profile && profile.profile_image) ? profile.profile_image : c.img;

        html += `
            <div
                class="map-node ${isMyNode}"
                data-id="${c.id}"
                id="map-node-${c.id}"
                style="left:${pos.x}%; top:${pos.y}%; transform:translate(-50%,-50%);"
            >
                <img src="${imgSrc}" alt="${c.name}">
                <span class="node-name">${c.name}</span>
            </div>`;
    });

    /* 관계 배지(rel-label) HTML 생성 */
    staticMapData.edges.forEach(function (edge, idx) {
        html += `
            <div
                class="rel-label"
                data-idx="${idx}"
                style="border-color:${edge.color}; color:${edge.color};"
            >${edge.text}</div>`;
    });

    nodesLayer.innerHTML = html;

    /* 선과 배지 위치 동기화 */
    updateDynamicPositions();

    /* 진영 배경 다시 그리기 */
    renderGroups();
}


/* ─────────────────────────────────────────────────────────────────
   5. 드래그 이벤트 (노드 & 배지 이동)
───────────────────────────────────────────────────────────────── */

/* 드래그 상태 변수 */
let dragObj       = null;  /* 현재 드래그 중인 객체 정보 */
let dragStartX    = 0;     /* 드래그 시작 마우스 X */
let dragStartY    = 0;     /* 드래그 시작 마우스 Y */
let isClickAction = false; /* 단순 클릭인지 드래그인지 구분 */

/* 마우스 버튼 누름: 드래그 시작 준비 */
document.addEventListener('mousedown', function (e) {
    const container = document.getElementById('static-map-container');
    if (!container || !container.contains(e.target)) return;

    /* 클릭한 요소가 노드인지 배지인지 확인 */
    const node  = e.target.closest('.map-node');
    const badge = e.target.closest('.rel-label');

    if      (node)  dragObj = { type: 'node',  id:  node.dataset.id,                el: node };
    else if (badge) dragObj = { type: 'badge', idx: parseInt(badge.dataset.idx),    el: badge };
    else            return;

    isClickAction = true; /* 일단 클릭으로 간주 */
    dragStartX    = e.clientX;
    dragStartY    = e.clientY;
});

/* 마우스 이동: 편집 모드에서만 드래그 처리 */
document.addEventListener('mousemove', function (e) {
    if (!dragObj || !isMapEditMode) return;

    /* 3px 이상 움직였으면 드래그로 판정 */
    if (Math.abs(e.clientX - dragStartX) > 3 || Math.abs(e.clientY - dragStartY) > 3) {
        isClickAction = false;
    }

    /* 마우스 위치를 컨테이너 기준 % 좌표로 변환 */
    const rect     = document.getElementById('static-map-container').getBoundingClientRect();
    const xPercent = Math.max(0, Math.min(100, ((e.clientX - rect.left)  / rect.width)  * 100));
    const yPercent = Math.max(0, Math.min(100, ((e.clientY - rect.top)   / rect.height) * 100));

    if (dragObj.type === 'node') {
        /* 노드 위치 업데이트 */
        staticMapData.nodes[dragObj.id].x = xPercent;
        staticMapData.nodes[dragObj.id].y = yPercent;
        dragObj.el.style.left = `${xPercent}%`;
        dragObj.el.style.top  = `${yPercent}%`;
        updateDynamicPositions();
        renderGroups();

    } else if (dragObj.type === 'badge') {
        /* 배지 위치(pos 비율) 업데이트 */
        const edge = staticMapData.edges[dragObj.idx];
        const n1   = staticMapData.nodes[edge.from];
        const n2   = staticMapData.nodes[edge.to];
        if (n1 && n2) {
            /* 마우스 위치를 선 위의 가장 가까운 점(비율)으로 투영 */
            const dx    = n2.x - n1.x;
            const dy    = n2.y - n1.y;
            const lenSq = dx * dx + dy * dy;
            if (lenSq > 0) {
                const t = ((xPercent - n1.x) * dx + (yPercent - n1.y) * dy) / lenSq;
                edge.pos = Math.max(0.15, Math.min(0.85, t)); /* 양 끝에서 너무 벗어나지 않도록 */
            }
            updateDynamicPositions();
        }
    }
});

/* 마우스 버튼 떼기: 단순 클릭이면 에디터 열기 */
document.addEventListener('mouseup', function (e) {
    if (!dragObj) return;

    if (isClickAction) {
        if (isMapEditMode && dragObj.type === 'badge') {
            /* 편집 모드에서 배지 클릭 → 관계선 에디터 열기 */
            openEdgeEditor(dragObj.idx);
        } else if (isMapEditMode && dragObj.type === 'node') {
            /* 편집 모드에서 노드 클릭 → 인물 에디터 열기 */
            openNodeEditor(dragObj.id);
        } else if (!isMapEditMode && dragObj.type === 'node' && !dragObj.id.startsWith('custom_')) {
            /* 일반 모드에서 노드 클릭 → 해당 캐릭터 탭으로 이동 */
            openGeneralModal(`char-${dragObj.id}`, currentMapPhase);
        }
    }

    dragObj = null;
});


/* ─────────────────────────────────────────────────────────────────
   6. 편집 모드 토글
───────────────────────────────────────────────────────────────── */

/**
 * 관계도 편집 모드를 켜고 끕니다.
 * 편집 모드에서는 노드와 배지를 드래그로 이동할 수 있습니다.
 */
window.toggleMapEdit = function () {
    isMapEditMode = !isMapEditMode;

    const toggleBtn  = document.getElementById('btn-toggle-edit');
    const addEdgeBtn = document.getElementById('btn-add-edge');
    const addNodeBtn = document.getElementById('btn-add-node');

    if (isMapEditMode) {
        /* 편집 모드 ON */
        document.body.classList.add('map-edit-mode');
        toggleBtn.innerHTML       = 'Edit Mode OFF (저장 필요)';
        toggleBtn.style.color     = '#ff6666';
        toggleBtn.style.borderColor = '#ff6666';
        addEdgeBtn.style.display  = 'inline-block';
        addNodeBtn.style.display  = 'inline-block';
    } else {
        /* 편집 모드 OFF */
        document.body.classList.remove('map-edit-mode');
        toggleBtn.innerHTML       = 'Edit Mode';
        toggleBtn.style.color     = '';
        toggleBtn.style.borderColor = '';
        addEdgeBtn.style.display  = 'none';
        addNodeBtn.style.display  = 'none';
        closeEdgeEditor();
    }
};

/**
 * 챕터를 전환합니다.
 * Relations 탭의 챕터 탭 버튼에서 호출됩니다.
 */
window.changeMapPhase = function (phase) {
    if (currentMapPhase === phase) return;
    currentMapPhase = phase;

    /* 탭 버튼 active 상태 변경 */
    document.querySelectorAll('#map-phase-tabs .phase-btn').forEach(function (t, i) {
        t.classList.toggle('active', i === phase);
    });

    loadAndDrawMap(); /* 해당 챕터의 관계도 로드 */
};


/* ─────────────────────────────────────────────────────────────────
   7. 관계선 에디터
───────────────────────────────────────────────────────────────── */

/**
 * 관계선 에디터 패널을 엽니다.
 *
 * 매개변수:
 *   idx : staticMapData.edges 배열의 인덱스 (-1이면 새 관계선 추가)
 */
window.openEdgeEditor = function (idx) {
    const panel   = document.getElementById('floating-edge-editor');
    const fromSel = document.getElementById('edge-from');
    const toSel   = document.getElementById('edge-to');

    /* From/To 선택 목록을 전체 캐릭터로 채우기 */
    fromSel.innerHTML = '';
    toSel.innerHTML   = '';
    getMergedCharData().forEach(function (c) {
        fromSel.innerHTML += `<option value="${c.id}">${c.name}</option>`;
        toSel.innerHTML   += `<option value="${c.id}">${c.name}</option>`;
    });

    document.getElementById('edge-idx').value = idx;

    if (idx === -1) {
        /* 새 관계선 추가: 임시 데이터로 배열에 먼저 추가 */
        const from = fromSel.options[0]?.value;
        const to   = toSel.options[1]?.value || from;
        staticMapData.edges.push({ from, to, text: '새 관계', color: '#aaaaaa', isDashed: false, pos: 0.5 });
        document.getElementById('edge-idx').value    = staticMapData.edges.length - 1;
        document.getElementById('edge-from').value   = from;
        document.getElementById('edge-to').value     = to;
        document.getElementById('edge-label').value  = '새 관계';
        document.getElementById('edge-color').value  = '#aaaaaa';
        document.getElementById('edge-dash').value   = 'false';
        document.getElementById('btn-delete-edge').style.display = 'none';
    } else {
        /* 기존 관계선 편집 */
        const edge = staticMapData.edges[idx];
        fromSel.value = edge.from;
        toSel.value   = edge.to;
        document.getElementById('edge-label').value  = edge.text;
        document.getElementById('edge-color').value  = edge.color;
        document.getElementById('edge-dash').value   = String(edge.isDashed);
        document.getElementById('btn-delete-edge').style.display = 'block';
    }

    panel.style.display = 'flex';
    renderStaticMap(); /* 새 관계선이 추가됐으면 화면에 반영 */
};

/** 입력 변경 시 관계선 미리보기를 업데이트합니다. */
window.previewEdge = function () {
    const idx = parseInt(document.getElementById('edge-idx').value);
    if (idx < 0 || idx >= staticMapData.edges.length) return;

    staticMapData.edges[idx].from     = document.getElementById('edge-from').value;
    staticMapData.edges[idx].to       = document.getElementById('edge-to').value;
    staticMapData.edges[idx].text     = document.getElementById('edge-label').value;
    staticMapData.edges[idx].isDashed = (document.getElementById('edge-dash').value === 'true');
    renderStaticMap();
};

/** 색상 버튼 클릭 시 색상을 변경하고 미리보기를 업데이트합니다. */
window.previewEdgeColor = function (color) {
    document.getElementById('edge-color').value = color;
    const idx = parseInt(document.getElementById('edge-idx').value);
    if (idx < 0 || idx >= staticMapData.edges.length) return;
    staticMapData.edges[idx].color = color;
    renderStaticMap();
};

/** 관계선 에디터 패널을 닫습니다. */
window.closeEdgeEditor = function () {
    const panel = document.getElementById('floating-edge-editor');
    if (panel) panel.style.display = 'none';
};

/** 현재 편집 중인 관계선을 삭제합니다. */
window.deleteEdge = function () {
    const idx = parseInt(document.getElementById('edge-idx').value);
    if (confirm('이 관계선을 삭제하시겠습니까?')) {
        staticMapData.edges.splice(idx, 1);
        closeEdgeEditor();
        renderStaticMap();
    }
};


/* ─────────────────────────────────────────────────────────────────
   8. 노드 에디터 (인물 추가/수정/삭제)
───────────────────────────────────────────────────────────────── */

/**
 * 인물 편집 모달을 엽니다.
 *
 * 매개변수:
 *   nodeId : 편집할 노드의 id. null이면 새 인물 추가.
 */
window.openNodeEditor = function (nodeId) {
    const factionSel = document.getElementById('node-faction');

    /* 진영 선택 목록 채우기 (기존 + 커스텀 + '새 진영 만들기' 옵션) */
    factionSel.innerHTML = '';
    Object.keys(getMergedGroupConfig()).forEach(function (g) {
        factionSel.innerHTML += `<option value="${g}">${g}</option>`;
    });
    factionSel.innerHTML += `<option value="_new_">➕ 새 진영 만들기</option>`;

    document.getElementById('node-idx').value = nodeId || '';
    document.getElementById('new-faction-fields').style.display = 'none';

    if (!nodeId) {
        /* 새 인물 추가 */
        document.getElementById('node-modal-title').innerText       = '새 인물 추가';
        document.getElementById('node-name').value                  = '새 인물';
        document.getElementById('node-img').value                   = PLACEHOLDER_100;
        document.getElementById('btn-delete-node').style.display    = 'none';
    } else {
        /* 기존 인물 편집 */
        const cData = getMergedCharData().find(function (c) { return c.id === nodeId; });
        if (!cData) return;
        document.getElementById('node-modal-title').innerText       = '인물 정보 수정';
        document.getElementById('node-name').value                  = cData.name;
        document.getElementById('node-img').value                   = cData.img;
        factionSel.value = cData.title;
        /* 기본 캐릭터(charData)는 삭제 불가, 커스텀 인물만 삭제 가능 */
        document.getElementById('btn-delete-node').style.display    = nodeId.startsWith('custom_') ? 'inline-block' : 'none';
    }

    document.getElementById('node-edit-modal').classList.add('show');
};

/** '새 진영 만들기' 선택 시 추가 입력 필드를 표시합니다. */
window.toggleNewFactionFields = function (val) {
    document.getElementById('new-faction-fields').style.display = (val === '_new_') ? 'block' : 'none';
};

/** 인물 편집 내용을 적용합니다. */
window.applyNodeEdit = function () {
    const nodeId  = document.getElementById('node-idx').value;
    const name    = document.getElementById('node-name').value.trim();
    const img     = document.getElementById('node-img').value.trim();
    let   faction = document.getElementById('node-faction').value;

    /* 새 진영을 만드는 경우 */
    if (faction === '_new_') {
        faction     = document.getElementById('new-faction-name').value.trim();
        const color = document.getElementById('new-faction-color').value;
        if (!faction) { alert('새 진영 이름을 입력해주세요.'); return; }

        /* hex → rgb 변환해서 rgba 색상 만들기 */
        const hex = color.replace('#', '');
        const r   = parseInt(hex.substring(0, 2), 16);
        const g   = parseInt(hex.substring(2, 4), 16);
        const b   = parseInt(hex.substring(4, 6), 16);
        staticMapData.customGroups[faction] = {
            color:  `rgba(${r},${g},${b},0.08)`,
            border: color,
            name:   faction,
        };
    }

    if (!nodeId) {
        /* 새 인물 추가: 고유 id 생성 후 customNodes 배열에 추가 */
        const newId = 'custom_' + Date.now();
        staticMapData.customNodes.push({ id: newId, name, title: faction, img });
        staticMapData.nodes[newId] = { x: 50, y: 50 }; /* 기본 위치: 중앙 */

    } else if (nodeId.startsWith('custom_')) {
        /* 커스텀 인물 수정 */
        const cNode = staticMapData.customNodes.find(function (c) { return c.id === nodeId; });
        if (cNode) { cNode.name = name; cNode.title = faction; cNode.img = img; }

    } else {
        /* 기본 캐릭터(charData)는 이름/소속을 여기서 바꿀 수 없습니다 */
        alert('기본 캐릭터의 정보는 Config.js에서 수정해주세요.');
    }

    renderStaticMap();
    closeModal('node-edit-modal');
};

/** 커스텀 인물 노드를 삭제합니다. */
window.deleteNode = function () {
    const nodeId = document.getElementById('node-idx').value;
    if (confirm('이 인물을 삭제하시겠습니까?')) {
        /* customNodes 배열에서 제거 */
        staticMapData.customNodes = staticMapData.customNodes.filter(function (c) {
            return c.id !== nodeId;
        });
        /* 노드 위치 데이터 제거 */
        delete staticMapData.nodes[nodeId];
        /* 이 노드와 연결된 관계선도 모두 제거 */
        staticMapData.edges = staticMapData.edges.filter(function (e) {
            return e.from !== nodeId && e.to !== nodeId;
        });
        renderStaticMap();
        closeModal('node-edit-modal');
    }
};


/* ─────────────────────────────────────────────────────────────────
   9. DB 저장
───────────────────────────────────────────────────────────────── */

/**
 * 현재 관계도 데이터를 DB에 저장합니다.
 * 'Save' 버튼에서 호출됩니다.
 * character_profiles 테이블의 char_id='global_static_map' 행에 저장합니다.
 */
window.saveMapToDB = async function () {
    const btn = document.getElementById('btn-save-map');
    btn.innerText = 'Saving...';
    btn.disabled  = true;

    closeEdgeEditor(); /* 에디터 패널 닫기 */

    const { error } = await supabaseClient
        .from('character_profiles')
        .upsert({
            char_id:       'global_static_map',    /* 관계도 전용 특수 ID */
            phase:          currentMapPhase,        /* 현재 챕터 */
            relationships:  JSON.stringify(staticMapData), /* 전체 데이터를 JSON 문자열로 */
        });

    btn.innerText = 'Save';
    btn.disabled  = false;

    if (error) {
        alert('저장 실패: ' + error.message);
    } else {
        alert('Chapter ' + (currentMapPhase + 1) + ' 관계도가 저장되었습니다!');
    }
};
