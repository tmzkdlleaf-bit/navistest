/* =====================================================
   MyRoom.js — 마이룸 시스템 (자유 배치 + 레이어 커스텀)
   배포용 스크립트

   [변경사항]
   - 이모지 전면 제거 (텍스트 기호로 대체)
   - 캐릭터 이름 등 샘플 데이터는 더미값 사용
   - 모든 색상 참조를 CSS 변수로 일원화
   - 탭·버튼 레이블 영문화
   - 주석 전면 한국어로 재작성

   [등각투영 좌표계 설명]
   그리드 좌표 (gx, gy):
     - gx: 오른쪽 방향 (+X)
     - gy: 아래 방향 (+Y)
   화면 좌표 (px, py):
     - floorPt(gx, gy) 함수로 변환
     - gx+gy 가 클수록 화면 아래쪽(시야 앞쪽)에 위치

   [렌더링 순서 — 페인터 알고리즘]
   ① 바닥 타일 (뒤에서 앞 순서: gy 역순, gx 정순)
   ② 좌벽 타일 (z=0부터 위쪽)
   ③ 우벽 타일 (z=0부터 위쪽)
   ④ 격자 엣지선
   ⑤ 가구 (layer 정렬 후 gx+gy 오름차순)
===================================================== */

const MyRoomSys = {

    /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       [등각투영 상수]
       TW/TH: 타일 픽셀 너비/높이
       GW/GH: 그리드 가로/세로 칸 수
       GZ:    벽 높이 (z 방향 칸 수)
       OX/OY: 화면 원점 (좌상단 기준 픽셀)
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
    TW: 80, TH: 40,
    GW: 6,  GH: 6,  GZ: 4,
    OX: 300, OY: 440,

    /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       [상태 변수]
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
    currentViewId:    null,   /* 현재 보고 있는 방의 char_id */
    isEditMode:       false,  /* 편집 모드 활성 여부 */
    _inventoryItems:  [],     /* 인벤토리 아이템 배열 */
    _selectedInvItem: null,   /* 현재 손에 든 아이템 */
    _draggingItem:    null,   /* 드래그 중인 가구 객체 */

    /* 타일 데이터 스토어 */
    floorTiles:    {},  /* { "gx,gy": { sid, color, img } } */
    wallLTiles:    {},  /* { "gx,gz": { sid, color, bgImg } } */
    wallRTiles:    {},  /* { "gy,gz": { sid, color, bgImg } } */
    furnitureList: [],  /* [{ id, sourceId, img, gx, gy, w, h, layer }] */

    /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       [좌표 변환 함수]
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

    /**
     * 그리드 좌표 → 바닥 화면 좌표 변환
     * 등각투영 공식: x = OX + (gx-gy)*TW/2,  y = OY - (gx+gy)*TH/2
     */
    floorPt(gx, gy) {
        return {
            x: this.OX + (gx - gy) * this.TW / 2,
            y: this.OY - (gx + gy) * this.TH / 2,
        };
    },

    /**
     * 좌벽 그리드 좌표 → 화면 좌표
     * 바닥 뒷 끝(gy=GH)을 기준으로 z만큼 위로 올림
     */
    wallLPt(gx, gz) {
        const base = this.floorPt(gx, this.GH);
        return { x: base.x, y: base.y - gz * this.TH };
    },

    /**
     * 우벽 그리드 좌표 → 화면 좌표
     * 바닥 오른 끝(gx=GW)을 기준으로 z만큼 위로 올림
     */
    wallRPt(gy, gz) {
        const base = this.floorPt(this.GW, gy);
        return { x: base.x, y: base.y - gz * this.TH };
    },

    /**
     * 화면 픽셀 좌표 → 그리드 좌표 변환 (역변환)
     * 드래그 놓기 시 자유좌표 계산에 사용
     */
    screenToGrid(px, py) {
        const rx = px - this.OX;
        const ry = this.OY - py;
        return {
            gx: Math.max(0, Math.min(this.GW - 1, Math.round((rx / this.TW) + (ry / this.TH)))),
            gy: Math.max(0, Math.min(this.GH - 1, Math.round((ry / this.TH) - (rx / this.TW)))),
        };
    },

    /* 바닥 타일 한 칸의 다이아몬드형 polygon 포인트 문자열 반환 */
    floorPoly(gx, gy) {
        const top   = this.floorPt(gx,   gy);
        const right = this.floorPt(gx+1, gy);
        const bot   = this.floorPt(gx+1, gy+1);
        const left  = this.floorPt(gx,   gy+1);
        return `${top.x},${top.y} ${right.x},${right.y} ${bot.x},${bot.y} ${left.x},${left.y}`;
    },

    /* 좌벽 타일 한 칸의 평행사변형 polygon 포인트 문자열 반환 */
    wallLPoly(gx, gz) {
        const tl = this.wallLPt(gx,   gz+1);
        const tr = this.wallLPt(gx+1, gz+1);
        const br = this.wallLPt(gx+1, gz);
        const bl = this.wallLPt(gx,   gz);
        return `${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`;
    },

    /* 우벽 타일 한 칸의 평행사변형 polygon 포인트 문자열 반환 */
    wallRPoly(gy, gz) {
        const tr = this.wallRPt(gy,   gz+1);
        const tl = this.wallRPt(gy+1, gz+1);
        const bl = this.wallRPt(gy+1, gz);
        const br = this.wallRPt(gy,   gz);
        return `${tr.x},${tr.y} ${tl.x},${tl.y} ${bl.x},${bl.y} ${br.x},${br.y}`;
    },

    /* 패널 탭 활성화 (인덱스 기준) */
    _updateTabs(idx) {
        document.querySelectorAll('#myroom-tabs .phase-btn')
            .forEach((t, i) => t.classList.toggle('active', i === idx));
    },

    /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       [1] 방 불러오기 — 내 방 / 이웃 방 진입 진입점
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

    /** 내 방 불러오기 */
    async loadMyRoom() {
        if (!currentUser) return alert('로그인이 필요합니다.');
        document.getElementById('room-visit-list').style.display  = 'none';
        document.getElementById('room-canvas-area').style.display = 'block';
        this._updateTabs(0);
        await this._renderRoom(charOwners[currentUser.email], true);
    },

    /** 이웃 목록 표시 */
    async loadVisitList() {
        document.getElementById('room-visit-list').style.display  = 'block';
        document.getElementById('room-canvas-area').style.display = 'none';
        this._updateTabs(1);

        const listDiv = document.getElementById('room-neighbors');
        if (!listDiv) return;

        /* charData: 전체 캐릭터 배열, allProfiles: 전체 프로필 배열 */
        listDiv.innerHTML = charData.map(c => {
            const id  = 'char-' + c.id;
            const p   = allProfiles.find(x => x.char_id === id && x.phase === 0);
            const img = (p && p.profile_image)
                ? p.profile_image
                : 'https://placehold.co/100x100/222/666?text=?';
            return `<div class="relation-card" style="cursor:pointer;"
                onclick="MyRoomSys.visitRoom('${id}','${c.name}')">
                <img src="${img}" class="relation-avatar">
                <div class="relation-name">${c.name}의 방</div>
            </div>`;
        }).join('');
    },

    /** 다른 캐릭터의 방 방문 */
    async visitRoom(charId, charName) {
        document.getElementById('room-visit-list').style.display  = 'none';
        document.getElementById('room-canvas-area').style.display = 'block';
        this._updateTabs(1);
        await this._renderRoom(charId, false, charName || '');
    },

    /**
     * 방 렌더링 공통 로직.
     * @param {string}  charId  - 표시할 캐릭터 ID
     * @param {boolean} isMine  - 내 방인지 여부 (편집 버튼 표시)
     * @param {string}  charName - 방문 시 표시할 이름 (선택적)
     */
    async _renderRoom(charId, isMine, charName) {
        this.currentViewId    = charId;
        this.isEditMode       = false;
        this._inventoryItems  = [];
        this._selectedInvItem = null;
        this._draggingItem    = null;

        /* 버튼 가시성 제어 */
        document.getElementById('btn-room-edit').style.display  = isMine ? 'inline-block' : 'none';
        document.getElementById('btn-room-back').style.display  = isMine ? 'none' : 'inline-block';
        document.getElementById('btn-room-save').style.display  = 'none';
        document.getElementById('room-inventory').style.display = 'none';

        /* 방 주인 이름 표시 */
        const titleName = isMine
            ? (charData.find(c => 'char-' + c.id === charId)?.name || '나')
            : charName;
        document.getElementById('room-owner-name').innerText = titleName + '의 방';

        /* DB에서 방 데이터 조회 */
        const { data: profile } = await supabaseClient
            .from('character_profiles')
            .select('room_data')
            .eq('char_id', charId)
            .eq('phase', 0)
            .single();

        /* 타일/가구 상태 초기화 */
        this.floorTiles    = {};
        this.wallLTiles    = {};
        this.wallRTiles    = {};
        this.furnitureList = [];

        /* 저장된 데이터가 있으면 파싱하여 복원 */
        if (profile?.room_data) {
            try {
                const raw = typeof profile.room_data === 'string'
                    ? JSON.parse(profile.room_data)
                    : profile.room_data;
                /* v2 포맷 확인 */
                if (raw?.v === 2) {
                    this.floorTiles    = raw.floorTiles    || {};
                    this.wallLTiles    = raw.wallLTiles    || {};
                    this.wallRTiles    = raw.wallRTiles    || {};
                    this.furnitureList = raw.furnitureList || [];
                }
            } catch (e) {
                console.warn('[MyRoom] 방 데이터 파싱 오류:', e);
            }
        }

        this._buildCanvas();
    },

    /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       [2] 편집 모드 진입/해제
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
    async toggleEditMode() {
        this.isEditMode       = !this.isEditMode;
        this._selectedInvItem = null;
        this._draggingItem    = null;

        if (this.isEditMode) {
            document.getElementById('room-inventory').style.display = 'block';
            document.getElementById('btn-room-edit').style.display  = 'none';
            document.getElementById('btn-room-save').style.display  = 'inline-block';
            await this._loadInventory();
        } else {
            /* 편집 취소 → 방 재로드 */
            this._renderRoom(this.currentViewId, true);
        }
        this._buildCanvas();
    },

    /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       [3] 인벤토리 로드 및 렌더링
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

    /** DB에서 가구 인벤토리 조회 후 남은 수량 계산 */
    async _loadInventory() {
        const { data: profile } = await supabaseClient
            .from('character_profiles')
            .select('furniture_inventory')
            .eq('char_id', this.currentViewId)
            .eq('phase', 0)
            .single();

        let furn = [];
        if (profile?.furniture_inventory) {
            try {
                furn = typeof profile.furniture_inventory === 'string'
                    ? JSON.parse(profile.furniture_inventory)
                    : profile.furniture_inventory;
            } catch (e) { console.warn('[MyRoom] 인벤토리 파싱 오류:', e); }
        }
        if (!Array.isArray(furn)) furn = [];

        /* 이미 배치된 가구 수량 집계 */
        const usedCount = {};
        this.furnitureList.forEach(p => {
            usedCount[p.sourceId] = (usedCount[p.sourceId] || 0) + 1;
        });

        this._inventoryItems = furn.filter(it => it?.name).map((it, i) => {
            const sid = it.id || ('_inv_' + i);
            const total = parseInt(it.count) || 1;

            /* 바닥/벽지/가구별 사용 수량 합산 */
            const usedFloor = Object.values(this.floorTiles).filter(t => t.sid === sid).length;
            const usedWallL = Object.values(this.wallLTiles).filter(t => t.sid === sid).length;
            const usedWallR = Object.values(this.wallRTiles).filter(t => t.sid === sid).length;
            const usedFurn  = usedCount[sid] || 0;
            const used      = usedFloor + usedWallL + usedWallR + usedFurn;

            return { ...it, _sid: sid, _total: total, _remaining: Math.max(0, total - used) };
        });

        this._renderInv();
    },

    /** 인벤토리 그리드 렌더링 */
    _renderInv() {
        const wrap = document.getElementById('room-inventory-list');
        if (!wrap) return;
        wrap.innerHTML = '';

        if (!this._inventoryItems.length) {
            wrap.insertAdjacentHTML('beforeend',
                '<p style="color:var(--text-dim);font-size:12px;text-align:center;width:100%;">보유 아이템 없음</p>');
            return;
        }

        /* 손에 든 아이템이 있을 때 취소 버튼 표시 */
        if (this._selectedInvItem) {
            const cancel = document.createElement('div');
            cancel.style.cssText = 'width:100%;padding:5px 8px;background:rgba(200,200,200,0.06);' +
                'border:1px dashed #707070;border-radius:4px;cursor:pointer;font-size:10px;' +
                'color:#a0a0a0;font-weight:500;text-align:center;margin-bottom:6px;letter-spacing:1px;';
            cancel.textContent = 'CANCEL SELECTION';
            cancel.onclick = () => {
                this._selectedInvItem = null;
                this._renderInv();
                this._buildCanvas();
            };
            wrap.appendChild(cancel);
        }

        this._inventoryItems.forEach(item => {
            const el = document.createElement('div');
            el.className = 'inv-furniture-item';  /* CSS 클래스 (별도 stylesheet에서 정의) */
            el.style.cssText = 'position:relative;background:#222;border:1px solid #333;' +
                'border-radius:4px;aspect-ratio:1;display:flex;align-items:center;' +
                'justify-content:center;font-size:11px;color:#888;text-align:center;padding:6px;';

            const remaining  = item._remaining;
            const isSelected = this._selectedInvItem?._sid === item._sid;

            /* 타입 뱃지 (floor / wallpaper) */
            const typeBadge = item.type === 'wallpaper'
                ? '<div style="position:absolute;bottom:2px;right:2px;background:#333;color:#aaa;' +
                  'font-size:8px;padding:1px 3px;border-radius:2px;border:1px solid #444;">WALL</div>'
                : item.type === 'floor'
                    ? '<div style="position:absolute;bottom:2px;right:2px;background:#333;color:#aaa;' +
                      'font-size:8px;padding:1px 3px;border-radius:2px;border:1px solid #444;">FLOOR</div>'
                    : '';

            /* 수량 뱃지 */
            const cntBadge = item._total > 1
                ? `<div style="position:absolute;top:2px;left:2px;background:#444;color:#eee;` +
                  `font-size:8px;font-weight:700;padding:1px 4px;border-radius:2px;">${remaining}/${item._total}</div>`
                : '';

            if (remaining <= 0) {
                /* 수량 소진: 비활성 표시 */
                el.style.opacity = '0.3';
                el.style.cursor  = 'default';
                el.innerHTML = `<img src="${item.img}" style="max-width:75%;max-height:75%;filter:grayscale(1);">${cntBadge}${typeBadge}
                    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
                    font-size:9px;color:#888;background:rgba(0,0,0,0.5);border-radius:4px;letter-spacing:1px;">USED</div>`;
            } else {
                el.style.cursor = 'pointer';
                el.innerHTML = `<img src="${item.img}" style="max-width:75%;max-height:75%;">${cntBadge}${typeBadge}`;

                /* 선택된 아이템 강조 */
                if (isSelected) {
                    el.style.outline       = '2px solid #888';
                    el.style.outlineOffset = '2px';
                    el.style.background    = '#333';
                }

                el.onclick = () => {
                    this._selectedInvItem = isSelected ? null : item;
                    this._renderInv();
                    this._buildCanvas();
                };
            }
            wrap.appendChild(el);
        });
    },

    /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       [4] SVG 캔버스 빌드 (전체 재렌더링)
       렌더링 순서: 바닥 → 좌벽 → 우벽 → 격자선 → 가구
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
    _buildCanvas() {
        const container = document.getElementById('room-canvas');
        if (!container) return;

        const CW = 680, CH = 480;

        /* SVG 요소 재사용 또는 새로 생성 */
        let svg = container.querySelector('svg.iso-room');
        if (!svg) {
            svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('class', 'iso-room');
            svg.setAttribute('viewBox', `0 0 ${CW} ${CH}`);
            svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;min-height:480px;';

            /* 우클릭 시 현재 선택 해제 */
            svg.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (this._selectedInvItem) {
                    this._selectedInvItem = null;
                    this._renderInv();
                    this._buildCanvas();
                }
            });

            container.appendChild(svg);
        }

        svg.innerHTML = '';  /* 기존 내용 전체 제거 */

        /* CSS 크리스프 렌더링 */
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        defs.innerHTML = '<style>.iso-tile{shape-rendering:crispEdges;}</style>';
        svg.appendChild(defs);

        /* 렌더링 단계별 실행 */
        this._drawFloor(svg);                       /* ① 바닥 */
        this._drawWallL(svg);                       /* ② 좌벽 */
        this._drawWallR(svg);                       /* ③ 우벽 */
        this._drawEdges(svg);                       /* ④ 격자선 */
        if (this.isEditMode) this._attachTileHits(svg); /* ⑤ 클릭 히트박스 (편집 모드만) */
        this._drawFurniture(svg);                   /* ⑥ 가구 */
    },

    /** ① 바닥 타일 그리기 */
    _drawFloor(svg) {
        /* 페인터 알고리즘: 뒤(gy 작음)부터 앞(gy 큼) 순서로 그려야 앞 타일이 위에 표시됨 */
        for (let gy = this.GH - 1; gy >= 0; gy--) {
            for (let gx = 0; gx < this.GW; gx++) {
                const key  = `${gx},${gy}`;
                const tile = this.floorTiles[key];
                const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                poly.setAttribute('class', 'iso-tile');
                poly.setAttribute('points', this.floorPoly(gx, gy));

                if (tile?.img) {
                    /* 이미지 패턴으로 채우기 */
                    const pid = `fl_${gx}_${gy}`;
                    this._ensureImgPattern(svg, pid, tile.img, true);
                    poly.setAttribute('fill', `url(#${pid})`);
                } else if (tile?.color) {
                    poly.setAttribute('fill', tile.color);
                } else {
                    /* 기본 바닥: 밝은/어두운 회색 체크 패턴 */
                    poly.setAttribute('fill', (gx + gy) % 2 === 0 ? '#2c2c2c' : '#262626');
                }

                poly.setAttribute('stroke', '#1e1e1e');
                poly.setAttribute('stroke-width', (tile?.img) ? '0' : '0.5');
                svg.appendChild(poly);
            }
        }
    },

    /** ② 좌벽 타일 그리기 */
    _drawWallL(svg) {
        for (let gz = 0; gz < this.GZ; gz++) {
            for (let gx = 0; gx < this.GW; gx++) {
                const key  = `${gx},${gz}`;
                const tile = this.wallLTiles[key];
                const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                poly.setAttribute('class', 'iso-tile');
                poly.setAttribute('points', this.wallLPoly(gx, gz));

                if (tile?.bgImg) {
                    const pid = `wl_${gx}_${gz}`;
                    this._ensureImgPattern(svg, pid, tile.bgImg);
                    poly.setAttribute('fill', `url(#${pid})`);
                } else if (tile?.color) {
                    poly.setAttribute('fill', tile.color);
                } else {
                    poly.setAttribute('fill', '#323232');  /* 기본 좌벽 색상 */
                }

                poly.setAttribute('stroke', '#282828');
                poly.setAttribute('stroke-width', '0.5');
                svg.appendChild(poly);
            }
        }
    },

    /** ③ 우벽 타일 그리기 (좌벽보다 약간 어두워 입체감 표현) */
    _drawWallR(svg) {
        for (let gz = 0; gz < this.GZ; gz++) {
            for (let gy = 0; gy < this.GH; gy++) {
                const key  = `${gy},${gz}`;
                const tile = this.wallRTiles[key];
                const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                poly.setAttribute('class', 'iso-tile');
                poly.setAttribute('points', this.wallRPoly(gy, gz));

                if (tile?.bgImg) {
                    const pid = `wr_${gy}_${gz}`;
                    this._ensureImgPattern(svg, pid, tile.bgImg);
                    poly.setAttribute('fill', `url(#${pid})`);
                } else if (tile?.color) {
                    /* 우벽은 좌벽 색보다 약간 어둡게 처리 */
                    poly.setAttribute('fill', this._darken(tile.color, 0.85));
                } else {
                    poly.setAttribute('fill', '#2a2a2a');  /* 기본 우벽 색상 */
                }

                poly.setAttribute('stroke', '#202020');
                poly.setAttribute('stroke-width', '0.5');
                svg.appendChild(poly);
            }
        }
    },

    /** ⑥ 가구 그리기 (layer 정렬 + 등각투영 깊이 정렬) */
    _drawFurniture(svg) {
        /*
         * 정렬 우선순위:
         *   1순위: layer 값 (유저가 휠로 조절) — 클수록 화면 앞에 표시
         *   2순위: gx+gy 합 (등각투영 깊이) — 클수록 시야 앞쪽
         */
        this.furnitureList.sort((a, b) => {
            const layerA = a.layer || 0;
            const layerB = b.layer || 0;
            if (layerA !== layerB) return layerA - layerB;
            return ((a.gx || 0) + (a.gy || 0)) - ((b.gx || 0) + (b.gy || 0));
        });

        this.furnitureList.forEach(item => {
            const pt   = this.floorPt(item.gx || 0, item.gy || 0);
            const imgEl = document.createElementNS('http://www.w3.org/2000/svg', 'image');
            imgEl.setAttribute('href', item.img);

            const w = (item.w || 1) * this.TW;
            const h = item.h || 80;
            imgEl.setAttribute('x',      pt.x - w / 2);
            imgEl.setAttribute('y',      pt.y - h + this.TH);
            imgEl.setAttribute('width',  w);
            imgEl.setAttribute('height', h);
            imgEl.setAttribute('preserveAspectRatio', 'xMidYMax meet');
            imgEl.style.imageRendering = 'pixelated';

            /* 편집 모드일 때만 드래그/휠/우클릭 이벤트 바인딩 */
            if (this.isEditMode) {
                imgEl.style.cursor = 'grab';

                /* ── 드래그 시작 ── */
                imgEl.addEventListener('mousedown', (e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    e.stopPropagation();

                    /* 손에 든 아이템 있으면 내려놓기 */
                    if (this._selectedInvItem) {
                        this._selectedInvItem = null;
                        this._renderInv();
                    }

                    this._draggingItem = item;
                    imgEl.style.cursor  = 'grabbing';
                    imgEl.style.opacity = '0.6';

                    const rect   = svg.getBoundingClientRect();
                    const scaleX = svg.viewBox.baseVal.width  / rect.width;
                    const scaleY = svg.viewBox.baseVal.height / rect.height;
                    const startMx = (e.clientX - rect.left) * scaleX;
                    const startMy = (e.clientY - rect.top)  * scaleY;

                    /* 드래그 시작 시점의 가구 화면 좌표와 마우스 좌표 차이를 오프셋으로 저장 */
                    const curBase = this.floorPt(item.gx, item.gy);
                    const offX    = curBase.x - startMx;
                    const offY    = curBase.y - startMy;

                    /* ── 이동 중 ── */
                    const onMouseMove = (ev) => {
                        const mx = (ev.clientX - rect.left) * scaleX;
                        const my = (ev.clientY - rect.top)  * scaleY;
                        /* 실시간으로 이미지 위치만 업데이트 (캔버스 전체 재빌드 없음) */
                        imgEl.setAttribute('x', mx + offX - w / 2);
                        imgEl.setAttribute('y', my + offY - h + this.TH / 2);
                    };

                    /* ── 놓기 (드래그 종료) ── */
                    const onMouseUp = (ev) => {
                        window.removeEventListener('mousemove', onMouseMove);
                        window.removeEventListener('mouseup',   onMouseUp);

                        if (!this._draggingItem) return;

                        const mx = (ev.clientX - rect.left) * scaleX;
                        const my = (ev.clientY - rect.top)  * scaleY;

                        /* 마우스를 놓은 화면 좌표 → 그리드 좌표 (소수점 허용 — 자유 배치) */
                        const basePx = mx + offX;
                        const basePy = my + offY;
                        const rx     = basePx - this.OX;
                        const ry     = this.OY - basePy;
                        const freeGx = (rx / this.TW) + (ry / this.TH);
                        const freeGy = (ry / this.TH) - (rx / this.TW);

                        /* 방 경계 내로 제한 */
                        item.gx = Math.max(0, Math.min(this.GW, freeGx));
                        item.gy = Math.max(0, Math.min(this.GH, freeGy));

                        this._draggingItem = null;
                        this._buildCanvas();  /* 드래그 완료 후 전체 재렌더링 */
                    };

                    window.addEventListener('mousemove', onMouseMove);
                    window.addEventListener('mouseup',   onMouseUp);
                });

                /* ── 마우스 휠: 레이어(Z-index) 조절 ──
                   위로 굴리면 앞으로(+1), 아래로 굴리면 뒤로(-1) */
                imgEl.addEventListener('wheel', (e) => {
                    if (this._draggingItem) return;  /* 드래그 중 오작동 방지 */
                    e.preventDefault();
                    e.stopPropagation();
                    item.layer = (item.layer || 0) + (e.deltaY < 0 ? 1 : -1);
                    this._buildCanvas();  /* 레이어 변경 즉시 반영 */
                });

                /* ── 우클릭: 가구 회수 (인벤토리로 반환) ── */
                imgEl.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (this._draggingItem) return;

                    /* 손에 든 아이템이 있으면 선택 취소 */
                    if (this._selectedInvItem) {
                        this._selectedInvItem = null;
                        this._renderInv();
                        this._buildCanvas();
                        return;
                    }

                    /* 인벤토리 남은 수량 복구 */
                    const inv = this._inventoryItems.find(it => it._sid === item.sourceId);
                    if (inv) inv._remaining = Math.min(inv._total, inv._remaining + 1);

                    /* 가구 목록에서 제거 */
                    this.furnitureList = this.furnitureList.filter(f => f.id !== item.id);

                    this._buildCanvas();
                    this._renderInv();
                });
            }

            svg.appendChild(imgEl);
        });
    },

    /** ④ 격자 엣지선 그리기 (방 모서리 강조) */
    _drawEdges(svg) {
        const color = '#1a1a1a';
        const width = '2';

        /* 좌벽 수직선: 바닥 뒷끝 → 천장 */
        for (let gx = 0; gx <= this.GW; gx++) {
            this._line(svg,
                this.floorPt(gx, this.GH).x, this.floorPt(gx, this.GH).y,
                this.wallLPt(gx, this.GZ).x,  this.wallLPt(gx, this.GZ).y,
                color, width
            );
        }
        /* 우벽 수직선: 바닥 오른끝 → 천장 */
        for (let gy = 0; gy <= this.GH; gy++) {
            this._line(svg,
                this.floorPt(this.GW, gy).x, this.floorPt(this.GW, gy).y,
                this.wallRPt(gy, this.GZ).x,  this.wallRPt(gy, this.GZ).y,
                color, width
            );
        }
    },

    /** SVG line 요소 생성 헬퍼 */
    _line(svg, x1, y1, x2, y2, color, w) {
        const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        l.setAttribute('x1', x1); l.setAttribute('y1', y1);
        l.setAttribute('x2', x2); l.setAttribute('y2', y2);
        l.setAttribute('stroke',       color);
        l.setAttribute('stroke-width', w || '1');
        l.setAttribute('stroke-linecap', 'square');
        l.style.pointerEvents = 'none';  /* 클릭 이벤트 통과 */
        svg.appendChild(l);
    },

    /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       [⑤ 편집용 히트박스] 바닥/벽 클릭 시 아이템 설치
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
    _attachTileHits(svg) {
        const self = this;

        /* ── 바닥 히트박스 ── */
        for (let gy = 0; gy < this.GH; gy++) {
            for (let gx = 0; gx < this.GW; gx++) {
                const poly = this._makePoly(this.floorPoly(gx, gy));
                const _gx  = gx, _gy = gy;
                poly.addEventListener('mouseover', function () {
                    if (!self._draggingItem) this.setAttribute('fill', 'rgba(255,255,255,0.10)');
                });
                poly.addEventListener('mouseout', function () { this.setAttribute('fill', 'transparent'); });
                poly.addEventListener('click',        () => { if (!self._draggingItem) self._onTileClick('floor', _gx, _gy); });
                poly.addEventListener('contextmenu', (e) => { e.preventDefault(); self._onTileRightClick('floor', _gx, _gy); });
                svg.appendChild(poly);
            }
        }

        /* ── 좌벽 히트박스 ── */
        for (let gz = 0; gz < this.GZ; gz++) {
            for (let gx = 0; gx < this.GW; gx++) {
                const poly = this._makePoly(this.wallLPoly(gx, gz));
                const _gx  = gx, _gz = gz;
                poly.addEventListener('mouseover', function () {
                    if (!self._draggingItem) this.setAttribute('fill', 'rgba(255,255,255,0.10)');
                });
                poly.addEventListener('mouseout', function () { this.setAttribute('fill', 'transparent'); });
                poly.addEventListener('click',        () => { if (!self._draggingItem) self._onTileClick('wallL', _gx, _gz); });
                poly.addEventListener('contextmenu', (e) => { e.preventDefault(); self._onTileRightClick('wallL', _gx, _gz); });
                svg.appendChild(poly);
            }
        }

        /* ── 우벽 히트박스 ── */
        for (let gz = 0; gz < this.GZ; gz++) {
            for (let gy = 0; gy < this.GH; gy++) {
                const poly = this._makePoly(this.wallRPoly(gy, gz));
                const _gy  = gy, _gz = gz;
                poly.addEventListener('mouseover', function () {
                    if (!self._draggingItem) this.setAttribute('fill', 'rgba(255,255,255,0.08)');
                });
                poly.addEventListener('mouseout', function () { this.setAttribute('fill', 'transparent'); });
                poly.addEventListener('click',        () => { if (!self._draggingItem) self._onTileClick('wallR', _gy, _gz); });
                poly.addEventListener('contextmenu', (e) => { e.preventDefault(); self._onTileRightClick('wallR', _gy, _gz); });
                svg.appendChild(poly);
            }
        }
    },

    /** 투명 polygon 히트박스 요소 생성 헬퍼 */
    _makePoly(points) {
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        p.setAttribute('points', points);
        p.setAttribute('fill',   'transparent');
        p.setAttribute('stroke', 'none');
        p.style.cursor = 'pointer';
        return p;
    },

    /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       [5] 타일 클릭 — 아이템 설치
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
    _onTileClick(face, a, b) {
        const item = this._selectedInvItem;
        if (!item || this._draggingItem) return;
        if (item._remaining <= 0) return alert('보유 수량이 부족합니다.');

        if (item.type === 'wallpaper') {
            /* 벽지: 좌벽 또는 우벽에만 설치 가능 */
            if (face === 'wallL') {
                const key = `${a},${b}`;
                if (this.wallLTiles[key]?.sid === item._sid) return;  /* 중복 설치 방지 */
                /* 기존 타일이 있으면 인벤토리 반환 */
                if (this.wallLTiles[key]) {
                    const prevInv = this._inventoryItems.find(it => it._sid === this.wallLTiles[key].sid);
                    if (prevInv) prevInv._remaining = Math.min(prevInv._total, prevInv._remaining + 1);
                } else {
                    item._remaining -= 1;
                }
                this.wallLTiles[key] = { sid: item._sid, color: item.colorL || item.color || '#383838', bgImg: item.bgImg || null };

            } else if (face === 'wallR') {
                const key = `${a},${b}`;
                if (this.wallRTiles[key]?.sid === item._sid) return;
                if (this.wallRTiles[key]) {
                    const prevInv = this._inventoryItems.find(it => it._sid === this.wallRTiles[key].sid);
                    if (prevInv) prevInv._remaining = Math.min(prevInv._total, prevInv._remaining + 1);
                } else {
                    item._remaining -= 1;
                }
                this.wallRTiles[key] = { sid: item._sid, color: item.colorR || item.color || '#303030', bgImg: item.bgImg || null };

            } else {
                alert('벽지는 벽에만 설치할 수 있습니다.');
                return;
            }

        } else if (item.type === 'floor') {
            /* 바닥재: 바닥 타일에만 설치 가능 */
            if (face !== 'floor') return;
            const key = `${a},${b}`;
            if (this.floorTiles[key]?.sid === item._sid) return;
            if (this.floorTiles[key]) {
                const prevInv = this._inventoryItems.find(it => it._sid === this.floorTiles[key].sid);
                if (prevInv) prevInv._remaining = Math.min(prevInv._total, prevInv._remaining + 1);
            } else {
                item._remaining -= 1;
            }
            this.floorTiles[key] = { sid: item._sid, color: item.color || '#404040', img: item.img || null };

        } else {
            /* 일반 가구: 바닥에만 설치, 자유 소수점 좌표 사용 */
            if (face !== 'floor') return;
            this.furnitureList.push({
                id:       'f_' + Date.now() + '_' + Math.floor(Math.random() * 9999),
                sourceId: item._sid,
                img:      item.img,
                gx:       a + 0.5,        /* 타일 중앙에 배치 */
                gy:       b + 0.5,
                w:        item.tileW || 1,
                h:        item.height || 80,
                layer:    0,              /* 기본 레이어 */
            });
            item._remaining -= 1;
        }

        this._buildCanvas();
        this._renderInv();
    },

    /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       [우클릭] 타일 아이템 회수 / 선택 취소
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
    _onTileRightClick(face, a, b) {
        if (this._draggingItem) return;

        /* 손에 든 아이템 취소 */
        if (this._selectedInvItem) {
            this._selectedInvItem = null;
            this._renderInv();
            this._buildCanvas();
            return;
        }

        /* 해당 타일의 아이템을 인벤토리로 회수 */
        const key = `${a},${b}`;
        let removedSid = null;

        if      (face === 'floor'  && this.floorTiles[key])  { removedSid = this.floorTiles[key].sid;  delete this.floorTiles[key]; }
        else if (face === 'wallL'  && this.wallLTiles[key])  { removedSid = this.wallLTiles[key].sid;  delete this.wallLTiles[key]; }
        else if (face === 'wallR'  && this.wallRTiles[key])  { removedSid = this.wallRTiles[key].sid;  delete this.wallRTiles[key]; }

        if (removedSid) {
            const inv = this._inventoryItems.find(it => it._sid === removedSid);
            if (inv) inv._remaining = Math.min(inv._total, inv._remaining + 1);
            this._buildCanvas();
            this._renderInv();
        }
    },

    /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       [7] 유틸리티
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

    /**
     * SVG <defs> 내에 이미지 패턴을 등록.
     * 같은 ID가 이미 존재하면 중복 등록을 건너뜀.
     * @param {SVGElement} svg     - 대상 SVG 요소
     * @param {string}     id      - 패턴 ID
     * @param {string}     imgUrl  - 이미지 URL
     * @param {boolean}    isFloor - 바닥 타일이면 다이아몬드 비율에 맞게 높이 조정
     */
    _ensureImgPattern(svg, id, imgUrl, isFloor = false) {
        if (svg.querySelector('#' + id)) return;

        let defs = svg.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            svg.prepend(defs);
        }

        const pat = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
        pat.setAttribute('id',           id);
        pat.setAttribute('patternUnits', 'userSpaceOnUse');
        pat.setAttribute('width',  this.TW);
        pat.setAttribute('height', isFloor ? this.TH * 2 : this.TH * 4);

        const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
        img.setAttribute('href',               imgUrl);
        img.setAttribute('width',  this.TW);
        img.setAttribute('height', isFloor ? this.TH * 2 : this.TH * 4);
        img.setAttribute('preserveAspectRatio', 'xMidYMid slice');

        pat.appendChild(img);
        defs.appendChild(pat);
    },

    /**
     * HEX 색상을 factor 비율로 어둡게 변환.
     * 우벽 음영 표현에 사용.
     * @param {string} hex    - "#RRGGBB" 형식
     * @param {number} factor - 0.0(완전 검정) ~ 1.0(원본)
     */
    _darken(hex, factor) {
        try {
            const r  = parseInt(hex.slice(1, 3), 16);
            const g  = parseInt(hex.slice(3, 5), 16);
            const b  = parseInt(hex.slice(5, 7), 16);
            const rr = Math.round(r * factor).toString(16).padStart(2, '0');
            const gg = Math.round(g * factor).toString(16).padStart(2, '0');
            const bb = Math.round(b * factor).toString(16).padStart(2, '0');
            return `#${rr}${gg}${bb}`;
        } catch (e) { return hex; }
    },

    /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       [8] 저장 — 현재 배치를 DB에 upsert
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
    async saveRoom() {
        if (this._draggingItem)  return alert('가구를 내려놓은 후 저장해주세요.');
        if (!confirm('현재 배치를 저장하시겠습니까?')) return;

        /* v2 포맷: 버전 태그 + 세 가지 타일 맵 + 가구 목록 */
        const payload = {
            v:             2,
            floorTiles:    this.floorTiles,
            wallLTiles:    this.wallLTiles,
            wallRTiles:    this.wallRTiles,
            furnitureList: this.furnitureList,
        };

        const { error } = await supabaseClient
            .from('character_profiles')
            .update({ room_data: payload })
            .eq('char_id', this.currentViewId)
            .eq('phase', 0);

        if (error) { console.error('[MyRoom] 저장 오류:', error); return alert('저장 오류가 발생했습니다.'); }

        alert('저장되었습니다.');
        this.toggleEditMode();  /* 저장 후 편집 모드 해제 */
    },
};


/* =============================================================
   DIY 가구 제작 시스템
   — 인벤토리에서 "생성권" 아이템 사용 시 제작 UI를 열고,
     이미지를 업로드하여 커스텀 가구를 만든다.
============================================================= */

/**
 * 기존 useInvItemOne 함수를 래핑하여
 * 아이템 이름에 "생성권" 또는 "DIY"가 포함되면 제작 모달을 연다.
 */
const _originalUseInvItemOne = window.useInvItemOne;
window.useInvItemOne = function () {
    const itemName = document.getElementById('inv-slot-name')?.value || '';

    if (itemName.includes('생성권') || itemName.includes('DIY')) {
        /* 기존 인벤토리 모달 닫기 */
        const invModal = document.getElementById('inv-modal');
        if (invModal) { invModal.style.display = 'none'; invModal.classList.remove('show'); }

        /* DIY 폼 초기화 */
        document.getElementById('diy-name').value   = '';
        document.getElementById('diy-desc').value   = '';
        document.getElementById('diy-width').value  = '80';
        document.getElementById('diy-height').value = '80';
        document.getElementById('diy-file').value   = '';

        /* DIY 모달 열기 */
        const diyModal = document.getElementById('diy-modal');
        if (diyModal) {
            diyModal.style.display = 'flex';
            diyModal.classList.add('show');
            /* 닫기 버튼 바인딩 */
            const closeBtn = diyModal.querySelector('.auth-close');
            if (closeBtn) {
                closeBtn.onclick = () => { diyModal.style.display = 'none'; diyModal.classList.remove('show'); };
            }
        }
        return;
    }

    /* 생성권이 아니면 원래 동작 실행 */
    if (typeof _originalUseInvItemOne === 'function') _originalUseInvItemOne();
};

/**
 * DIY 가구 제작 실행.
 * 처리 흐름:
 *   1. 폼 유효성 검사
 *   2. 이미지 업로드 (uploadToImgbb 또는 FileReader 폴백)
 *   3. 일반 인벤토리에서 생성권 차감
 *   4. 가구 인벤토리에 신규 아이템 추가
 *   5. DB 업데이트
 */
window.submitDiyFurniture = async function () {
    const btn         = document.getElementById('diy-submit-btn');
    const nameInput   = document.getElementById('diy-name').value.trim();
    const descInput   = document.getElementById('diy-desc').value.trim();
    const widthInput  = parseInt(document.getElementById('diy-width').value)  || 80;
    const heightInput = parseInt(document.getElementById('diy-height').value) || 80;
    const fileInput   = document.getElementById('diy-file');

    /* 유효성 검사 */
    if (!nameInput) return alert('가구 이름을 입력해주세요.');
    if (!fileInput.files?.length) return alert('가구 이미지를 첨부해주세요.');
    if (!currentUser) return alert('로그인이 필요합니다.');

    const myCharId = charOwners[currentUser.email];
    if (!myCharId) return alert('캐릭터 권한이 없습니다.');

    btn.disabled   = true;
    btn.innerText  = '제작 중...';

    try {
        /* ── 이미지 업로드 ── */
        let imgUrl = '';
        if (typeof uploadToImgbb === 'function') {
            imgUrl = await uploadToImgbb(fileInput.files[0]);
            if (!imgUrl) throw new Error('이미지 업로드 실패');
        } else {
            /* uploadToImgbb가 없으면 base64 Data URL로 폴백 */
            imgUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload  = (e) => resolve(e.target.result);
                reader.onerror = () => reject(new Error('이미지 읽기 실패'));
                reader.readAsDataURL(fileInput.files[0]);
            });
        }

        /* ── DB에서 현재 인벤토리 조회 ── */
        const { data: profile, error: fetchErr } = await supabaseClient
            .from('character_profiles')
            .select('inventory, furniture_inventory')
            .eq('char_id', myCharId)
            .eq('phase', 0)
            .single();

        if (fetchErr) throw fetchErr;

        let generalInv = [], furnInv = [];
        try { generalInv = typeof profile.inventory           === 'string' ? JSON.parse(profile.inventory)           : (profile.inventory           || []); } catch (e) {}
        try { furnInv    = typeof profile.furniture_inventory === 'string' ? JSON.parse(profile.furniture_inventory) : (profile.furniture_inventory || []); } catch (e) {}
        if (!Array.isArray(generalInv)) generalInv = [];
        if (!Array.isArray(furnInv))    furnInv    = [];

        /* ── 생성권 아이템 찾기 ── */
        const ticketIdx = generalInv.findIndex(it =>
            (it.name || '').includes('생성권') || (it.name || '').includes('DIY')
        );
        if (ticketIdx === -1) throw new Error('소지품에 가구 생성권이 없습니다!');

        /* 생성권 수량 차감 (0이면 아이템 제거) */
        const ticketCount = parseInt(generalInv[ticketIdx].count) || 1;
        if (ticketCount > 1) { generalInv[ticketIdx].count = ticketCount - 1; }
        else                 { generalInv.splice(ticketIdx, 1); }

        /* ── 신규 가구 아이템 생성 ── */
        const tileW = Math.max(1, Math.round(widthInput / 80));  /* 80px = 1타일 기준 */
        furnInv.push({
            id:     'custom_furn_' + Date.now(),
            name:   nameInput,
            desc:   descInput || '직접 제작한 가구',
            img:    imgUrl,
            type:   'furniture',
            count:  1,
            tileW,
            height: heightInput,
        });

        /* ── DB 업데이트 ── */
        const { error: updateErr } = await supabaseClient
            .from('character_profiles')
            .update({
                inventory:           JSON.stringify(generalInv),
                furniture_inventory: JSON.stringify(furnInv),
            })
            .eq('char_id', myCharId)
            .eq('phase', 0);

        if (updateErr) throw updateErr;

        alert(`[${nameInput}] 가구 제작 완료!\nMY ROOM > INVENTORY 탭에서 확인하세요.`);

        /* 모달 닫기 */
        const diyModal = document.getElementById('diy-modal');
        if (diyModal) { diyModal.style.display = 'none'; diyModal.classList.remove('show'); }

        /* 편집 모드 중이면 인벤토리 갱신 */
        if (MyRoomSys.isEditMode) MyRoomSys._loadInventory();

    } catch (e) {
        console.error('[DIY] 오류:', e);
        alert('가구 제작 중 오류가 발생했습니다:\n' + e.message);
    } finally {
        btn.disabled  = false;
        btn.innerText = '가구 제작하기 (생성권 1개 소모)';
    }
};
