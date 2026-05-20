/* ================================================================= */
/* Combat.js — 대련장 (세련된 UI 모던화 및 페이즈/타임라인 연동)        */
/* [수정 사항]                                                       */
/* 1. 이모지 제거 (텍스트 대괄호 [ ] 기호로 대체)                        */
/* 2. 흑백 테마(Grayscale)에 맞춘 컬러 코드 전면 교체                  */
/* 3. 4인 파티 기준 데이터 바인딩 및 상세 주석 추가                      */
/* ================================================================= */

(function () {
    'use strict';

    // 이미지가 없을 때 표시되는 흑백 더미 플레이스홀더
    const PLACEHOLDER_100 = "https://placehold.co/100x100/111111/555555?text=No+Img";

    const CombatSys = {
        mode:            'solo', // 'solo' (개인전) 또는 'team' (단체전)
        arenaChannel:    null,   // Supabase 실시간 통신 채널
        myRole:          'spectator', // 현재 사용자의 역할 (p1, p2, a, b, spectator)
        lobbyInterval:   null,   // 로비 데이터 갱신 타이머
        _latestCombat:   null,   // 최신 개인전 데이터 캐싱
        _latestTeam:     null,   // 최신 단체전 데이터 캐싱
        currentCombatId: null,   // 현재 참여 중인 개인전 ID
        isDummyPractice: false,  // 목인장(AI) 연습 모드 여부
        _dummyCombat:    null,   // 목인장 연습 모드용 가상 데이터
        currentTeamId:   null,   // 현재 참여 중인 단체전 ID
        myTeam:          null,   // 단체전 소속 (a 또는 b)
        _teamBuilderA:   [],     // 단체전 방 생성 시 A팀(홍) 멤버 (최대 4인 파티 중 선택)
        _teamBuilderB:   [],     // 단체전 방 생성 시 B팀(청) 멤버 (최대 4인 파티 중 선택)

        /* ── 더미(목인장) 연습 상대를 위한 프리셋 데이터 (흑백화) ── */
        DUMMY_PRESETS: [
            { name:'목인장(쉬움)',   hp:6,  maxHp:6,  mp:5,  maxMp:5,  bp:10, maxBp:10, str:40,con:50,siz:50,dex:40, skills:{brawl:25,sword:25,bow:25,throw:20,magic:15,dodge:20,drive:20},  db:{dice:0,mod:0,label:'없음'},  weapons:[{name:'나무 주먹',dmg:'1d3',type:'brawl'}], img:'https://placehold.co/100x100/111111/555555?text=DUMMY' },
            { name:'목인장(보통)',   hp:9,  maxHp:9,  mp:8,  maxMp:8,  bp:20, maxBp:20, str:60,con:65,siz:65,dex:55, skills:{brawl:50,sword:50,bow:50,throw:40,magic:30,dodge:40,drive:40},  db:{dice:0,mod:0,label:'없음'},  weapons:[{name:'나무 주먹',dmg:'1d4',type:'brawl'}], img:'https://placehold.co/100x100/111111/555555?text=DUMMY' },
            { name:'목인장(어려움)', hp:13, maxHp:13, mp:15, maxMp:15, bp:30, maxBp:30, str:80,con:80,siz:75,dex:70, skills:{brawl:70,sword:70,bow:70,throw:60,magic:50,dodge:60,drive:60},  db:{dice:4,mod:0,label:'+1d4'}, weapons:[{name:'나무 주먹',dmg:'1d6',type:'brawl'}], img:'https://placehold.co/100x100/111111/555555?text=DUMMY' }
        ],

        /**
         * 주사위 굴림 판정 (1~100 백분위 굴림)
         * - 크리티컬, 대성공, 대실패 등급을 반환합니다. (흑백 컬러 적용)
         */
        _roll(skill) {
            const roll = Math.floor(Math.random() * 100) + 1;
            const ex = Math.floor(skill / 5), hd = Math.floor(skill / 2), fumble = skill < 50 ? 96 : 100;
            if (roll === 1)       return { roll, grade: 4, label: '대성공!',       color: '#dddddd' };
            if (roll >= fumble)   return { roll, grade: -1, label: '대실패…',      color: '#555555' };
            if (roll <= ex)       return { roll, grade: 3, label: '극단적 성공',   color: '#aaaaaa' };
            if (roll <= hd)       return { roll, grade: 2, label: '어려운 성공',   color: '#888888' };
            if (roll <= skill)    return { roll, grade: 1, label: '보통 성공',     color: 'var(--text-main)' };
            return                { roll, grade: 0, label: '실패',            color: '#777777' };
        },

        /**
         * 캐릭터 근력(STR)과 크기(SIZ)를 합산하여 데미지 보너스(DB)를 계산합니다.
         */
        _damageBonus(str, siz) {
            const s = str + siz;
            if (s <= 64)  return { dice: 0, mod: -2, label: '-2' };
            if (s <= 84)  return { dice: 0, mod: -1, label: '-1' };
            if (s <= 124) return { dice: 0, mod:  0, label: '없음' };
            if (s <= 164) return { dice: 4, mod:  0, label: '+1d4' };
            if (s <= 204) return { dice: 6, mod:  0, label: '+1d6' };
            return               { dice: 6, mod:  4, label: '+2d6' };
        },

        /**
         * 무기 데미지 문자열(예: '1d6+1')을 분석하여 피해량을 굴립니다.
         */
        _rollDmg(dmgStr, maxRoll = false) {
            const m = String(dmgStr).toLowerCase().match(/(\d+)d(\d+)([+-]\d+)?/);
            if (!m) return maxRoll ? 3 : Math.floor(Math.random() * 3) + 1;
            const cnt = parseInt(m[1]), sid = parseInt(m[2]), bon = m[3] ? parseInt(m[3]) : 0;
            if (maxRoll) return (cnt * sid) + bon; // 대성공 등 강제 최대치 적용 시
            let t = bon;
            for (let i = 0; i < cnt; i++) t += Math.floor(Math.random() * sid) + 1;
            return t;
        },

        /**
         * 4인 캐릭터 중 특정 ID의 캐릭터 스탯을 DB에서 불러와 전투용 객체로 조립합니다.
         */
        _buildCharData(charId, reqPhase) {
            const targetPhase = reqPhase !== undefined ? reqPhase : (window.globalMainPhase || 0);
            const profile = typeof allProfiles !== 'undefined' ? allProfiles.find(p => p.char_id === charId && p.phase === targetPhase) : null;
            const base    = charData.find(c => `char-${c.id}` === charId);
            const st      = ((profile?.stats) || base?.stats || '50,50,50,50,50,50,50,50').split(',').map(Number);
            
            const str = st[0]||50, con = st[1]||50, siz = st[2]||50, dex = st[3]||50, pow = st[6]||50;
            const maxHp = Math.round((con + siz) / 10), maxMp = Math.floor(pow / 5);
            let maxBp = pow;
            let b = 25, s = 25, bw = 25, t = 20, m = 15, do_ = dex * 2, dr = 20, weapons = [];
            
            // 무기 및 기능치 데이터 덮어쓰기
            if (profile?.weapon_data) {
                try {
                    const w = JSON.parse(profile.weapon_data);
                    b = w.brawl||25; s = w.sword||25; bw = w.bow||25; t = w.throw||20;
                    m = w.magic||15; do_ = w.dodge||(dex*2); dr = w.drive||20; weapons = w.weapons||[];
                    if (w.bp && w.bp > 0) maxBp = w.bp;
                } catch(e) {}
            }
            return {
                id: charId,
                name: base?.name || charId,
                img: profile?.combat_img || profile?.profile_image || base?.img || PLACEHOLDER_100,
                hp: maxHp, maxHp,
                mp: maxMp, maxMp,
                bp: maxBp, maxBp,
                str, con, siz, dex,
                skills: { brawl: b, sword: s, bow: bw, throw: t, magic: m, dodge: do_, drive: dr },
                db: this._damageBonus(str, siz),
                weapons,
                alive: true, fled: false, skipTurn: false
            };
        },

        // 팀원 검색 및 전멸 여부 헬퍼
        _findMember(tc, charId) { return [...(tc.team_a||[]), ...(tc.team_b||[])].find(m => m.id === charId); },
        _teamDead(members)       { return members.every(m => !m.alive || m.fled); },

        /**
         * 피격 시 진동 효과 애니메이션 트리거
         */
        _hitEffect(charId, damage) {
            const card = document.querySelector(`.combatant-card[data-id="${charId}"]`);
            if (!card) return;
            card.classList.remove('hit'); void card.offsetWidth; card.classList.add('hit');
            setTimeout(() => card.classList.remove('hit'), 600);
            const popup = document.createElement('div');
            popup.className = 'dmg-popup'; popup.textContent = `-${damage}`;
            card.appendChild(popup); setTimeout(() => popup.remove(), 1100);
        },
        
        /**
         * 사망 시 쓰러지는 효과 애니메이션 트리거
         */
        _deathEffect(charId) {
            const card = document.querySelector(`.combatant-card[data-id="${charId}"]`);
            if (card) { card.classList.add('dying'); setTimeout(() => card.classList.add('dead'), 900); }
        },

        /**
         * 모드(개인전 vs 팀전) 전환 스위치
         */
        switchMode(mode) {
            this.mode = mode;
            document.querySelectorAll('.combat-mode-btn').forEach(b => b.classList.remove('active'));
            document.querySelector(`.combat-mode-btn[data-mode="${mode}"]`)?.classList.add('active');
            document.getElementById('lobby-solo').style.display = mode === 'solo' ? '' : 'none';
            document.getElementById('lobby-team').style.display = mode === 'team' ? '' : 'none';
            const soloStage = document.getElementById('solo-arena-stage');
            const teamStage = document.getElementById('team-arena-stage');
            if (soloStage) soloStage.style.display = mode === 'solo' ? '' : 'none';
            if (teamStage) teamStage.style.display  = mode === 'team' ? '' : 'none';
            if (mode === 'team') this._renderTeamLobby(); else this.loadLobby();
        },

        /**
         * 로비 드롭다운 초기화 (개인전 상대 리스트 구성)
         */
        initDropdowns() {
            if (!currentUser || !supabaseClient) return;
            const sel = document.getElementById('spar-target'); if (!sel) return;
            const myCharId = charOwners[currentUser.email];
            sel.innerHTML = '<option value="">대련 상대를 선택하세요</option>';
            const rg = document.createElement('optgroup'); rg.label = '── USER LIST ──';
            
            // 4인 캐릭터 목록 중 본인을 제외한 멤버 노출
            [...charData].sort((a, b) => parseInt(a.id.replace(/\D/g,'')) - parseInt(b.id.replace(/\D/g,''))).forEach(c => {
                if (`char-${c.id}` !== myCharId) {
                    const o = document.createElement('option'); o.value = `char-${c.id}`; o.innerText = `${c.name}`; rg.appendChild(o);
                }
            });
            sel.appendChild(rg);
            
            const dg = document.createElement('optgroup'); dg.label = '── PRACTICE DUMMY ──';
            this.DUMMY_PRESETS.forEach((p, i) => {
                const o = document.createElement('option'); o.value = `dummy_${i}`; o.innerText = `${p.name}`; dg.appendChild(o);
            });
            sel.appendChild(dg);
            this.loadLobby(); this._startLobbyWatch();
        },

        _lobbyChannel: null,
        
        /**
         * 로비의 실시간 진행 현황 감시 시작 (타 유저의 전투 참여 알림 등)
         */
        _startLobbyWatch() {
            if (this.lobbyInterval) { clearInterval(this.lobbyInterval); this.lobbyInterval = null; }
            if (this._lobbyChannel) { try { supabaseClient.removeChannel(this._lobbyChannel); } catch(e) {} this._lobbyChannel = null; }
            if (!currentUser || !supabaseClient) return;
            const myCharId = charOwners[currentUser.email];
            this.lobbyInterval = setInterval(() => {
                const arena = document.getElementById('sparring-arena');
                if (arena && arena.style.display !== 'none') return;
                if (this.mode === 'solo') this.loadLobby(); else this._renderTeamLobby();
            }, 3000);
            
            this._lobbyChannel = supabaseClient.channel('lobby-watch-all')
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'combats' }, payload => {
                    if ((payload.new.p1_id === myCharId || payload.new.p2_id === myCharId) && payload.new.status === 'ongoing') {
                        if (this.currentCombatId !== payload.new.id && !this.isDummyPractice) {
                            const arena = document.getElementById('sparring-arena');
                            if (!arena || arena.style.display === 'none') this.joinArena(payload.new.id);
                        }
                    }
                }).subscribe();
        },
        _stopLobbyWatch() {
            if (this.lobbyInterval) { clearInterval(this.lobbyInterval); this.lobbyInterval = null; }
            if (this._lobbyChannel) { try { supabaseClient.removeChannel(this._lobbyChannel); } catch(e) {} this._lobbyChannel = null; }
        },

        /**
         * 개인전 로비 리스트(대기/진행중) 호출
         */
        async loadLobby() {
            if (!supabaseClient || !currentUser) return;
            const myCharId = charOwners[currentUser.email];
            const { data: combats } = await supabaseClient.from('combats').select('*').in('status', ['waiting','ongoing']).order('created_at', { ascending: false });
            const inB = document.getElementById('spar-incoming-requests');
            const onB = document.getElementById('spar-ongoing-list');
            if (!inB || !onB) return;
            const nm = {}; charData.forEach(c => { nm[`char-${c.id}`] = c.name; });
            let inH = '', onH = '';
            
            (combats || []).forEach(c => {
                const p1 = nm[c.p1_id] || c.p1_id, p2 = nm[c.p2_id] || c.p2_id;
                if (c.status === 'waiting') {
                    if (c.p2_id === myCharId)
                        inH += `<div class="modern-card"><div class="modern-card-content"><span class="modern-badge badge-incoming">REQUEST</span><span class="modern-card-title">${p1}</span><span class="modern-card-desc">대련을 요청했습니다.</span></div><button class="modern-action-btn btn-solid-accept" onclick="CombatSys.acceptChallenge('${c.id}')">수락</button></div>`;
                    else if (c.p1_id === myCharId)
                        inH += `<div class="modern-card"><div class="modern-card-content"><span class="modern-badge badge-waiting">WAITING</span><span class="modern-card-title">${p2}</span><span class="modern-card-desc">수락 대기 중입니다.</span></div><button class="modern-action-btn btn-solid-cancel" onclick="CombatSys.cancelChallenge('${c.id}')">취소</button></div>`;
                } else if (c.status === 'ongoing') {
                    onH += `<div class="modern-card"><div class="modern-card-content"><span class="modern-badge badge-live">LIVE</span><span class="modern-card-title">${p1} <span class="modern-vs">VS</span> ${p2}</span><span class="modern-card-desc">진행 중</span></div><button class="modern-action-btn btn-solid-spectate" onclick="CombatSys.joinArena('${c.id}')">관전</button></div>`;
                }
            });
            const em = (text) => `<div class="modern-empty-card">${text}</div>`;
            inB.innerHTML = inH || em('요청 내역이 없습니다.');
            onB.innerHTML = onH || em('진행 중인 대련이 없습니다.');
        },

        /**
         * 1:1 대련 신청 제출
         */
        async challenge() {
            if (!currentUser) return alert('로그인이 필요합니다.');
            const selVal = document.getElementById('spar-target')?.value;
            if (!selVal) return alert('대련 상대를 선택하세요.');
            // 선택된 상대가 목인장일 경우 AI 모드 실행
            if (selVal.startsWith('dummy_')) { this.startDummyPractice(parseInt(selVal.replace('dummy_', ''))); return; }
            
            const myCharId = charOwners[currentUser.email];
            const myPhase = window.combatRequestedPhases?.myPhase ?? window.globalMainPhase ?? 0;
            const targetPhase = window.combatRequestedPhases?.targetPhase ?? window.globalMainPhase ?? 0;
            
            const p1data = this._buildCharData(myCharId, myPhase);
            const p2data = this._buildCharData(selVal, targetPhase);
            
            const { error } = await supabaseClient.from('combats').insert([{
                p1_id: myCharId, p2_id: selVal, status: 'waiting', combat_phase: 'initiative',
                attacker_id: null, round: 1, chosen_weapon: null, attack_roll: null,
                p1_data: p1data, p2_data: p2data, spectators: [], bets: { p1: [], p2: [] },
                log: [`[ ${p1data.name} (${myPhase + 1}부) <span style="color:var(--accent-color)">VS</span> ${p2data.name} (${targetPhase + 1}부) ] 개인전 신청`]
            }]);
            
            if (error) { console.error(error); return alert('신청 실패'); }
            alert('신청이 완료되었습니다.'); this.loadLobby();
        },
        async cancelChallenge(id) { if (!confirm('신청을 취소하시겠습니까?')) return; await supabaseClient.from('combats').delete().eq('id', id); this.loadLobby(); },
        async acceptChallenge(id) { await supabaseClient.from('combats').update({ status: 'ongoing' }).eq('id', id); this.joinArena(id); },

        // ─────────────────────────────────────────────────────────────
        // 팀전 로비 & 빌더 
        // ─────────────────────────────────────────────────────────────
        _renderTeamLobby() {
            const lb = document.getElementById('team-lobby-area'); if (!lb) return;
            if (lb.querySelector('#team-a-slots')) { this._loadTeamOngoing(); return; }
            this._teamBuilderA = []; this._teamBuilderB = [];
            lb.innerHTML = `
            <div class="challenge-box-modern">
                <div class="challenge-box-title">새로운 단체전 구성</div>
                <div class="team-builder-grid" style="display: grid; grid-template-columns: 1fr 40px 1fr; gap: 15px; align-items: stretch; margin-bottom: 20px;">
                    <div class="team-col team-col-a" style="background:#111; padding:20px; border-radius:8px; border:1px solid #333;">
                        <div style="font-size:1.1rem; color:#fff; font-weight:bold; letter-spacing:2px; margin-bottom:15px; border-left:4px solid #888888; padding-left:10px;">홍</div>
                        <div id="team-a-slots" class="team-slot-list" style="margin-bottom:15px; min-height:80px;"></div>
                        <button class="modern-action-btn" style="width:100%; background:transparent; border:1px dashed #666; color:#aaa;" onclick="CombatSys._addToTeam('a')">+ 추가하기</button>
                    </div>
                    <div style="display:flex; align-items:center; justify-content:center; font-weight:bold; color:var(--accent-color); font-size:1.2rem; font-family:'Nanum Myeongjo',serif;">대</div>
                    <div class="team-col team-col-b" style="background:#111; padding:20px; border-radius:8px; border:1px solid #333;">
                        <div style="font-size:1.1rem; color:#fff; font-weight:bold; letter-spacing:2px; margin-bottom:15px; border-left:4px solid #777777; padding-left:10px;">청</div>
                        <div id="team-b-slots" class="team-slot-list" style="margin-bottom:15px; min-height:80px;"></div>
                        <button class="modern-action-btn" style="width:100%; background:transparent; border:1px dashed #666; color:#aaa;" onclick="CombatSys._addToTeam('b')">+ 추가하기</button>
                    </div>
                </div>
                <button class="btn-challenge-large" onclick="CombatSys.createTeamBattle()">시작</button>
            </div>
            
            <div class="lobby-list-label-modern" style="margin-top: 30px;">진행 중인 단체전</div>
            <div id="team-ongoing-list" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 15px;"></div>`;
            this._renderTeamSlots(); this._loadTeamOngoing();
        },
        _addToTeam(side) {
            const used = [...this._teamBuilderA, ...this._teamBuilderB];
            const available = charData.filter(c => !used.includes(`char-${c.id}`));
            if (!available.length) return alert('추가할 캐릭터가 없습니다.');
            const old = document.getElementById('team-pick-modal'); if (old) old.remove();
            
            const modal = document.createElement('div');
            modal.id = 'team-pick-modal';
            modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);';
            modal.innerHTML = `
                <div style="background:#151515;border:1px solid var(--accent-color);border-radius:12px;padding:30px;min-width:320px;max-width:90vw;box-shadow:0 10px 30px rgba(0,0,0,0.8);">
                    <h4 style="color:#fff; letter-spacing:2px; margin:0 0 20px; font-size:1.1rem; border-bottom:1px solid #333; padding-bottom:10px;">선택하기</h4>
                    <select id="team-pick-sel" class="combat-select-large" style="margin-bottom:20px;">
                        ${available.map(c => `<option value="char-${c.id}">${c.name}</option>`).join('')}
                    </select>
                    <div style="display:flex;gap:10px;">
                        <button onclick="CombatSys._confirmAddToTeam('${side}')" style="flex:1;padding:12px;background:var(--accent-color);color:#111;border:none;border-radius:6px;font-weight:bold;letter-spacing:1px;cursor:pointer;">추가</button>
                        <button onclick="document.getElementById('team-pick-modal').remove()" style="flex:1;padding:12px;background:#222;color:#888;border:1px solid #444;border-radius:6px;font-weight:bold;letter-spacing:1px;cursor:pointer;">취소</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
            modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
        },
        _confirmAddToTeam(side) {
            const sel = document.getElementById('team-pick-sel'); if (!sel || !sel.value) return;
            if (side === 'a') this._teamBuilderA.push(sel.value); else this._teamBuilderB.push(sel.value);
            document.getElementById('team-pick-modal')?.remove(); this._renderTeamSlots();
        },
        _removeFromTeam(side, idx) {
            if (side === 'a') this._teamBuilderA.splice(idx, 1); else this._teamBuilderB.splice(idx, 1);
            this._renderTeamSlots();
        },
        _renderTeamSlots() {
            const targetPhase = window.globalMainPhase || 0;
            const nm = {}; charData.forEach(c => { nm[`char-${c.id}`] = c.name; });
            const getImg = id => {
                const p = typeof allProfiles !== 'undefined' ? allProfiles.find(x => x.char_id === id && x.phase === targetPhase) : null;
                const b = charData.find(c => `char-${c.id}` === id);
                return p?.combat_img || p?.profile_image || b?.img || PLACEHOLDER_100;
            };
            const render = (ids, side) => ids.length
                ? ids.map((id, i) => `<div style="display:flex;align-items:center;background:rgba(255,255,255,0.05);padding:8px 12px;border-radius:6px;margin-bottom:8px;border:1px solid rgba(255,255,255,0.1);"><img src="${getImg(id)}" style="width:30px;height:30px;border-radius:4px;object-fit:cover;margin-right:10px;filter:grayscale(100%);" onerror="this.src='${PLACEHOLDER_100}'"><span style="flex:1;color:#eee;font-weight:bold;font-size:0.9rem;">${nm[id]||id}</span><button style="background:transparent;border:none;color:#888;cursor:pointer;font-size:1rem;" onclick="CombatSys._removeFromTeam('${side}',${i})">&times;</button></div>`).join('')
                : `<div style="text-align:center;color:#666;font-size:0.85rem;padding:20px 0;">멤버 없음</div>`;
            const sA = document.getElementById('team-a-slots'); if (sA) sA.innerHTML = render(this._teamBuilderA, 'a');
            const sB = document.getElementById('team-b-slots'); if (sB) sB.innerHTML = render(this._teamBuilderB, 'b');
        },

        async _loadTeamOngoing() {
            const ol = document.getElementById('team-ongoing-list'); if (!ol || !supabaseClient) return;
            const { data } = await supabaseClient.from('team_combats').select('id,team_a,team_b,status').eq('status','ongoing').order('created_at',{ascending:false});
            const nm = {}; charData.forEach(c => { nm[`char-${c.id}`] = c.name; });
            if (!data || !data.length) {
                ol.innerHTML = `<div class="modern-empty-card" style="grid-column: 1 / -1;">진행 중인 단체전이 없습니다.</div>`;
                return;
            }
            ol.innerHTML = data.map(tc => {
                const aN = (tc.team_a||[]).map(m => nm[m.id]||m.id).join(', ');
                const bN = (tc.team_b||[]).map(m => nm[m.id]||m.id).join(', ');
                return `<div class="modern-card" style="flex-direction:column; align-items:stretch; gap:15px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #333; padding-bottom:10px;">
                                <span class="modern-badge badge-live">TEAM MATCH</span>
                            </div>
                            <div style="display:flex; flex-direction:column; gap:5px; margin-bottom:10px;">
                                <span style="color:#888888; font-size:0.9rem; font-weight:bold;">홍 <span style="color:#aaa;font-weight:normal;margin-left:5px;">${aN}</span></span>
                                <span style="color:#777777; font-size:0.9rem; font-weight:bold;">청<span style="color:#aaa;font-weight:normal;margin-left:5px;">${bN}</span></span>
                            </div>
                            <button class="modern-action-btn btn-solid-spectate" style="width:100%;" onclick="CombatSys.joinTeamArena('${tc.id}')">관전하기</button>
                        </div>`;
            }).join('');
        },

        async createTeamBattle() {
            if (!currentUser) return alert('로그인이 필요합니다.');
            if (!this._teamBuilderA.length || !this._teamBuilderB.length) return alert('홍과 청에 각 1명 이상 추가하세요.');
            
            const targetPhase = window.globalMainPhase || 0;
            const teamA = this._teamBuilderA.map(id => { const d = this._buildCharData(id, targetPhase); d.team = 'a'; return d; });
            const teamB = this._teamBuilderB.map(id => { const d = this._buildCharData(id, targetPhase); d.team = 'b'; return d; });
            
            const { data, error } = await supabaseClient.from('team_combats').insert([{
                status: 'ongoing', combat_phase: 'initiative',
                team_a: teamA, team_b: teamB,
                turn_order: [], current_turn_idx: 0,
                attacker_id: null, target_id: null, chosen_weapon: null, attack_roll: null,
                spectators: [], bets: { a: [], b: [] },
                log: [`[ 단체전 시작 ] 타임라인: ${targetPhase + 1}부`, `[홍] ${teamA.map(m=>m.name).join(', ')}`, `[청] ${teamB.map(m=>m.name).join(', ')}`, `선공 판정 대기 중...`]
            }]).select().single();
            if (error) { console.error(error); return alert('단체전 생성 실패'); }
            await this.joinTeamArena(data.id, true);
        },

        /**
         * 1:1 개인전 아레나 입장 처리
         */
        async joinArena(combatId) {
            if (!currentUser) return alert('로그인이 필요합니다.');
            this._stopLobbyWatch();
            this.mode = 'solo'; this.isDummyPractice = false; this.currentCombatId = combatId; this.currentTeamId = null;
            const myCharId = charOwners[currentUser.email];
            const { data: combat, error } = await supabaseClient.from('combats').select('*').eq('id', combatId).single();
            if (error || !combat) return alert('대련 정보를 찾을 수 없거나 파기되었습니다.');
            this._latestCombat = combat;
            if (combat.p1_id === myCharId)      this.myRole = 'p1';
            else if (combat.p2_id === myCharId) this.myRole = 'p2';
            else                                this.myRole = 'spectator';
            
            // 관전자로 참여 시 이름 등록
            if (this.myRole === 'spectator') {
                const myName = charData.find(c => `char-${c.id}` === myCharId)?.name || myCharId;
                const specs = [...(combat.spectators || [])];
                if (!specs.includes(myName)) { specs.push(myName); await supabaseClient.from('combats').update({ spectators: specs }).eq('id', combatId); }
            }
            if (this.arenaChannel) { try { supabaseClient.removeChannel(this.arenaChannel); } catch(e) {} this.arenaChannel = null; }
            this.arenaChannel = supabaseClient.channel(`arena-${combatId}`)
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'combats', filter: `id=eq.${combatId}` }, payload => { this._latestCombat = payload.new; this.updateArenaUI(payload.new); })
                .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'combats', filter: `id=eq.${combatId}` }, () => { alert('대련방이 폭파되어 로비로 돌아갑니다.'); this.forceExitArena(); })
                .subscribe();
                
            const arena = document.getElementById('sparring-arena'); if (arena) arena.style.display = 'flex';
            const soloStage = document.getElementById('solo-arena-stage'), teamStage = document.getElementById('team-arena-stage');
            if (soloStage) soloStage.style.display = ''; if (teamStage) teamStage.style.display = 'none';
            const fleeBtn = document.querySelector('.btn-flee'); if (fleeBtn) fleeBtn.innerText = '대련 포기 (방 폭파)';
            this._renderMyMoney(); this.updateArenaUI(combat);
        },

        // ─────────────────────────────────────────────────────────────
        // 단체전 아레나 입장 처리
        // ─────────────────────────────────────────────────────────────
        async joinTeamArena(teamCombatId, isCreator = false) {
            if (!currentUser) return alert('로그인이 필요합니다.');
            this._stopLobbyWatch();
            this.mode = 'team'; this.currentTeamId = teamCombatId; this.currentCombatId = null; this.isDummyPractice = false;
            const { data: tc, error } = await supabaseClient.from('team_combats').select('*').eq('id', teamCombatId).single();
            if (error || !tc) return alert('단체전 정보를 찾을 수 없거나 파기되었습니다.');
            this._latestTeam = tc;
            const myCharId = charOwners[currentUser.email];
            if      ((tc.team_a||[]).some(m => m.id === myCharId)) { this.myTeam = 'a'; this.myRole = 'a'; }
            else if ((tc.team_b||[]).some(m => m.id === myCharId)) { this.myTeam = 'b'; this.myRole = 'b'; }
            else                                                   { this.myTeam = 'spectator'; this.myRole = 'spectator'; }
            if (this.arenaChannel) { try { supabaseClient.removeChannel(this.arenaChannel); } catch(e) {} this.arenaChannel = null; }

            // 채널 구독 완료 대기
            await new Promise(resolve => {
                this.arenaChannel = supabaseClient.channel(`team-arena-${teamCombatId}`)
                    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'team_combats', filter: `id=eq.${teamCombatId}` }, payload => { this._latestTeam = payload.new; this.updateTeamArenaUI(payload.new); })
                    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'team_combats', filter: `id=eq.${teamCombatId}` }, () => { alert('단체전 방이 폭파되어 로비로 돌아갑니다.'); this.forceExitArena(); })
                    .subscribe(status => {
                        if (status === 'SUBSCRIBED') resolve();
                    });
            });

            const arena = document.getElementById('sparring-arena'); if (arena) arena.style.display = 'flex';
            const soloStage = document.getElementById('solo-arena-stage'), teamStage = document.getElementById('team-arena-stage');
            if (soloStage) soloStage.style.display = 'none'; if (teamStage) teamStage.style.display = '';
            const fleeBtn = document.querySelector('.btn-flee'); if (fleeBtn) fleeBtn.innerText = '대련 포기 (방 폭파)';
            this._renderMyMoney(); this.updateTeamArenaUI(tc);

            if (isCreator && tc.combat_phase === 'initiative') await this._rollTeamInitiative(tc);
        },

        startDummyPractice(presetIdx) {
            this._stopLobbyWatch();
            this.mode = 'solo'; this.isDummyPractice = true; this.currentCombatId = null; this.currentTeamId = null; this.myRole = 'p1';
            
            const myCharId = charOwners[currentUser.email];
            const myPhase = window.combatRequestedPhases?.myPhase ?? window.globalMainPhase ?? 0;
            const myData = this._buildCharData(myCharId, myPhase);
            
            const dummy = JSON.parse(JSON.stringify(this.DUMMY_PRESETS[presetIdx]));
            dummy.id = 'char-dummy'; dummy.alive = true; dummy.fled = false; dummy.skipTurn = false;
            
            this._dummyCombat = {
                id: 'dummy', p1_id: myCharId, p2_id: 'char-dummy', status: 'ongoing', combat_phase: 'initiative',
                attacker_id: null, round: 1, chosen_weapon: null, attack_roll: null,
                p1_data: myData, p2_data: dummy, spectators: [], bets: { p1: [], p2: [] },
                log: [`[ ${myData.name} (${myPhase + 1}부) <span style="color:var(--accent-color)">VS</span> ${dummy.name} ]`, `연습 대련 시작!`]
            };
            const arena = document.getElementById('sparring-arena'); if (arena) arena.style.display = 'flex';
            const soloStage = document.getElementById('solo-arena-stage'), teamStage = document.getElementById('team-arena-stage');
            if (soloStage) soloStage.style.display = ''; if (teamStage) teamStage.style.display = 'none';
            const fleeBtn = document.querySelector('.btn-flee'); if (fleeBtn) fleeBtn.innerText = '대련 종료';
            this._renderMyMoney(); this.updateArenaUI(this._dummyCombat);
        },

        async executeDummyAI(data) {
            if (!this.isDummyPractice) return;
            await new Promise(r => setTimeout(r, 900));
            const phase = data.combat_phase;
            if (phase === 'initiative')                                            await this.rollInitiative();
            else if (phase === 'attack'  && data.attacker_id === 'char-dummy')     await this._dummyRollAttack();
            else if (phase === 'defense' && data.attacker_id !== 'char-dummy')     await this._dummyRollDefense(Math.random() > 0.5 ? 'dodge' : 'counter');
        },

        async _dummyRollAttack() {
            const data = this._dummyCombat, dummy = data.p2_data;
            const w = dummy.weapons[0] || { name: '나무 주먹', dmg: '1d3', type: 'brawl' };
            const weapon = { name: w.name, dmg: w.dmg, type: w.type, skill: dummy.skills[w.type] || dummy.skills.brawl };
            const result = this._roll(weapon.skill), logs = [...data.log];
            logs.push(`[공격] <b>${dummy.name}</b> [${weapon.name}] [주사위: ${result.roll}] → <span style="color:${result.color}">${result.label}</span>`);
            let updates;
            if (result.grade === 4) {
                logs.push(`<span style="color:#cccccc;font-weight:bold;">대성공!</span> 방어 불가!`);
                updates = await this._applyDamage(data, 'char-dummy', weapon, result, logs, true, false);
            } else if (result.grade <= 0) {
                logs.push(result.grade === 0 ? `빗나감.` : `대실패…`);
                updates = this._nextTurn(data, logs);
            } else {
                logs.push(`[${data.p1_data.name}의 차례] 회피 또는 반격을 선택하세요.`);
                updates = { combat_phase: 'defense', chosen_weapon: weapon, attack_roll: { roll: result.roll, grade: result.grade, gradeLabel: result.label, gradeColor: result.color } };
            }
            await this._updateCombat({ ...updates, log: logs });
        },

        async _dummyRollDefense(type) {
            const data = this._dummyCombat, dummy = data.p2_data;
            const attWeap = data.chosen_weapon || { name: '맨손', dmg: '1d3', type: 'brawl' }, attRoll = data.attack_roll || { grade: 1 };
            const skillVal = type === 'dodge' ? dummy.skills.dodge : dummy.skills[attWeap.type] || dummy.skills.brawl;
            const label = type === 'dodge' ? '회피' : '반격';
            const result = this._roll(skillVal), logs = [...data.log];
            logs.push(`[${label}] <b>${dummy.name}</b> [주사위: ${result.roll}] → <span style="color:${result.color}">${result.label}</span>`);
            const attGrade = attRoll.grade || 0, defGrade = result.grade, isAttEx = attGrade >= 3;
            let updates = {};
            if (type === 'dodge') {
                if (defGrade > 0 && defGrade >= attGrade) { logs.push(`회피 성공!`); Object.assign(updates, this._nextTurn(data, logs)); }
                else { logs.push(`회피 실패!`); Object.assign(updates, await this._applyDamage(data, data.attacker_id, attWeap, attRoll, logs, isAttEx, attWeap.isBoost)); }
            } else {
                if (defGrade > attGrade) { logs.push(`반격 성공!`); Object.assign(updates, await this._applyDamage(data, 'char-dummy', { name:'반격', dmg:'1d3', type:'brawl' }, result, logs, defGrade >= 3, false)); }
                else if (defGrade === attGrade && defGrade > 0) {
                    logs.push(`반격 동률! 상호 피해!`);
                    const res1 = await this._applyDamage(data, data.attacker_id, attWeap, attRoll, logs, isAttEx, attWeap.isBoost);
                    const res2 = await this._applyDamage({ ...data, ...res1 }, 'char-dummy', { name:'반격', dmg:'1d3', type:'brawl' }, result, logs, defGrade >= 3, false);
                    Object.assign(updates, res2);
                } else { logs.push(`반격 실패!`); Object.assign(updates, await this._applyDamage(data, data.attacker_id, attWeap, attRoll, logs, isAttEx, attWeap.isBoost)); }
            }
            await this._updateCombat({ ...updates, log: logs });
        },

        async _rollTeamInitiative(tc) {
            const logs = [...(tc.log || [])];
            logs.push(`[ 이니셔티브 판정 ]`);
            const allMembers = [...(tc.team_a || []), ...(tc.team_b || [])];
            const turnOrder = allMembers.map(m => {
                const r = this._roll(m.dex || 50);
                logs.push(`[선공] <b>${m.name}</b> DEX(${m.dex||50}) [주사위: ${r.roll}] → <span style="color:${r.color}">${r.label}</span>`);
                return { id: m.id, name: m.name, team: m.team, grade: r.grade, roll: r.roll, dex: m.dex || 50 };
            }).sort((a, b) => {
                if (b.grade !== a.grade) return b.grade - a.grade;
                return b.dex - a.dex;
            });
            logs.push(`행동 순서: ${turnOrder.map(t => `<b>${t.name}</b>`).join(' → ')}`);
            const first = turnOrder[0];
            logs.push(`<b style="color:var(--accent-color)">${first.name}</b> 선공!`);
            await supabaseClient.from('team_combats').update({
                turn_order: turnOrder,
                current_turn_idx: 0,
                attacker_id: first.id,
                combat_phase: 'action',
                log: logs
            }).eq('id', tc.id);
        },

        updateArenaUI(data) {
            if (!data) return;
            if (this.mode === 'team') { this.updateTeamArenaUI(data); return; }
            const p1 = data.p1_data || {}, p2 = data.p2_data || {};
            const _s = (id, prop, val) => { const el = document.getElementById(id); if (el) { el[prop] = val; el.style.display = ''; } };

            _s('cb-p1-name', 'innerText', p1.name || 'P1');
            _s('cb-p2-name', 'innerText', p2.name || 'P2');
            _s('cb-p1-img',  'src',       p1.img   || PLACEHOLDER_100);
            _s('cb-p2-img',  'src',       p2.img   || PLACEHOLDER_100);

            _s('cb-p1-hp-txt', 'innerText', `HP ${Math.max(0, p1.hp ?? p1.maxHp)} / ${p1.maxHp}`);
            _s('cb-p2-hp-txt', 'innerText', `HP ${Math.max(0, p2.hp ?? p2.maxHp)} / ${p2.maxHp}`);
            const hp1 = document.getElementById('cb-p1-hp'); if (hp1) hp1.style.width = `${Math.max(0, ((p1.hp ?? p1.maxHp) / p1.maxHp) * 100)}%`;
            const hp2 = document.getElementById('cb-p2-hp'); if (hp2) hp2.style.width = `${Math.max(0, ((p2.hp ?? p2.maxHp) / p2.maxHp) * 100)}%`;

            _s('cb-p1-mp-txt', 'innerText', `MP ${Math.max(0, p1.mp ?? p1.maxMp)} / ${p1.maxMp}`);
            _s('cb-p2-mp-txt', 'innerText', `MP ${Math.max(0, p2.mp ?? p2.maxMp)} / ${p2.maxMp}`);
            const mp1 = document.getElementById('cb-p1-mp'); if (mp1) mp1.style.width = `${Math.max(0, ((p1.mp ?? p1.maxMp) / p1.maxMp) * 100)}%`;
            const mp2 = document.getElementById('cb-p2-mp'); if (mp2) mp2.style.width = `${Math.max(0, ((p2.mp ?? p2.maxMp) / p2.maxMp) * 100)}%`;

            _s('cb-p1-bp-txt', 'innerText', `법력 ${Math.max(0, p1.bp ?? p1.maxBp)} / ${p1.maxBp}`);
            _s('cb-p2-bp-txt', 'innerText', `법력 ${Math.max(0, p2.bp ?? p2.maxBp)} / ${p2.maxBp}`);
            const bp1 = document.getElementById('cb-p1-bp'); if (bp1) bp1.style.width = `${Math.max(0, ((p1.bp ?? p1.maxBp) / p1.maxBp) * 100)}%`;
            const bp2 = document.getElementById('cb-p2-bp'); if (bp2) bp2.style.width = `${Math.max(0, ((p2.bp ?? p2.maxBp) / p2.maxBp) * 100)}%`;

            const specs = data.spectators || [];
            const sc = document.getElementById('spectator-count'); if (sc) sc.innerText = specs.length;
            const sl = document.getElementById('spectator-list'); if (sl) sl.innerHTML = specs.map(n => `<span class="spectator-tag">[관전] ${n}</span>`).join('');
            const bets = data.bets || { p1: [], p2: [] };
            const rB = arr => (arr || []).map(b => `<span class="spectator-tag">${b.name} <b>${b.amount}G</b></span>`).join('');
            const p1B = document.getElementById('p1-bettors'); if (p1B) p1B.innerHTML = rB(bets.p1);
            const p2B = document.getElementById('p2-bettors'); if (p2B) p2B.innerHTML = rB(bets.p2);

            const logBox = document.getElementById('combat-log');
            if (logBox && data.log) { logBox.innerHTML = data.log.map(l => `<div>${l}</div>`).join(''); logBox.scrollTop = logBox.scrollHeight; }

            if (this.isDummyPractice && data.status === 'ongoing') {
                const isDT = (data.combat_phase === 'attack'  && data.attacker_id === 'char-dummy') ||
                             (data.combat_phase === 'defense' && data.attacker_id !== 'char-dummy') ||
                             (data.combat_phase === 'initiative');
                if (isDT) setTimeout(() => this.executeDummyAI(data), 1000);
            }
            this._renderActionPanel(data);
        },

        _renderActionPanel(data) {
            const box = document.getElementById('combat-actions'); if (!box) return;
            const phase = data.combat_phase, attackerId = data.attacker_id;
            const myCharId = currentUser ? charOwners[currentUser.email] : null;
            const p1 = data.p1_data || {}, p2 = data.p2_data || {};
            const myData     = (this.myRole === 'p1') ? p1 : p2;
            const isMe       = id => id === myCharId;
            const isAttacker = isMe(attackerId);
            const isPlayer   = (this.myRole === 'p1' || this.myRole === 'p2');
            const isDefender = isPlayer && !isAttacker && attackerId !== null;

            if (this.myRole === 'spectator') {
                box.innerHTML = `<div style="text-align:center;color:#888;width:100%;">관전 중...<br><br><button class="combat-btn combat-btn-surrender" style="width:100%;" onclick="CombatSys.forceExitArena()">관전 종료</button></div>`;
                return;
            }
            if (data.status === 'finished' || phase === 'finished') {
                box.innerHTML = `<div style="color:var(--accent-color);font-weight:bold;text-align:center;width:100%;padding:8px;">승패 결정!<br><br><button class="combat-btn combat-btn-dodge" style="width:100%;" onclick="CombatSys.forceExitArena()">대련장 나가기</button></div>`;
                return;
            }
            if (myData.skipTurn) {
                box.innerHTML = `<div style="text-align:center;color:#888888;font-weight:bold;width:100%;">턴을 소모하여 행동할 수 없습니다!</div>`;
                return;
            }

            if (phase === 'initiative') {
                if (!attackerId && this.myRole === 'p1') {
                    box.innerHTML = `
                        <div style="background:rgba(20,20,20,0.8);border:1px solid rgba(204,204,204,0.3);border-radius:8px;padding:20px;box-sizing:border-box;width:100%;">
                            <div style="color:#cccccc;text-align:center;font-size:1.1rem;font-weight:bold;margin-bottom:15px;letter-spacing:1px;">선공 판정</div>
                            <div style="color:#aaa;text-align:center;font-size:0.9rem;margin-bottom:15px;">DEX 대항 판정으로 선공을 결정합니다.</div>
                            <button class="combat-btn combat-btn-attack" style="width:100%;padding:14px;font-size:1.1rem;font-weight:bold;" onclick="CombatSys.rollInitiative()">주사위 굴리기</button>
                        </div>`;
                } else {
                    box.innerHTML = `<div style="text-align:center;color:#888;width:100%;padding:20px;">선공 판정 대기 중...</div>`;
                }
                return;
            }

            if (phase === 'attack') {
                if (isAttacker) {
                    const sk = myData.skills || { brawl:25, sword:25, bow:25, throw:20, magic:15, drive:20 };
                    let wOpts = `<option value="__unarmed__">[격투] 맨손 격투 (1d3 / 기능치 ${sk.brawl}%)</option>`;
                    (myData.weapons || []).forEach((w, i) => {
                        const wSkill   = sk[w.type] || sk.brawl;
                        const typeName = w.type==='sword'?'도검':w.type==='bow'?'활':w.type==='throw'?'투척':w.type==='magic'?'도술':'격투';
                        wOpts += `<option value="${i}">[${typeName}] ${w.name} (${w.dmg} / 기능치 ${wSkill}%)</option>`;
                    });
                    box.innerHTML = `
                        <div style="display:flex;gap:15px;background:rgba(20,20,20,0.8);border:1px solid rgba(204,204,204,0.3);border-radius:8px;padding:15px;box-sizing:border-box;width:100%;">
                            <div style="flex:1;display:flex;flex-direction:column;gap:10px;justify-content:center;">
                                <div style="color:#cccccc;font-size:0.95rem;font-weight:bold;letter-spacing:1px;margin-bottom:2px;">[ 전투 액션 ]</div>
                                <select id="attack-weapon-sel" class="combat-select" style="width:100%;box-sizing:border-box;padding:10px;font-size:0.9rem;background:#111;border:1px solid #444;color:#fff;">${wOpts}</select>
                                <label style="display:flex;align-items:center;justify-content:center;gap:6px;font-size:0.85rem;padding:10px;background:rgba(170,170,170,0.1);border:1px solid rgba(170,170,170,0.4);border-radius:6px;cursor:pointer;color:#aaaaaa;margin:0;">
                                    <input type="checkbox" id="attack-bp-boost" style="width:16px;height:16px;margin:0;cursor:pointer;">
                                    <span style="font-weight:bold;">법력 5점 소비 (데미지 2배)</span>
                                </label>
                            </div>
                            <div style="width:1px;background:rgba(204,204,204,0.2);"></div>
                            <div style="flex:1;display:flex;flex-direction:column;gap:8px;justify-content:center;">
                                <button class="combat-btn combat-btn-attack" style="width:100%;padding:14px;font-size:1.05rem;font-weight:bold;letter-spacing:1px;box-shadow:0 4px 6px rgba(0,0,0,0.3);" onclick="CombatSys.rollAttack()">공격 판정</button>
                                <div style="display:flex;gap:8px;">
                                    <button class="combat-btn combat-btn-dodge"     style="flex:1;padding:8px;font-size:0.85rem;" onclick="CombatSys.soloFlee()">도주</button>
                                    <button class="combat-btn combat-btn-surrender" style="flex:1;padding:8px;font-size:0.85rem;" onclick="CombatSys.surrender()">항복</button>
                                </div>
                            </div>
                        </div>`;
                } else {
                    const attName = (attackerId === data.p1_id) ? p1.name : p2.name;
                    box.innerHTML = `<div style="text-align:center;color:#888;width:100%;padding:20px;"><b>${attName}</b>의 공격 대기 중...</div>`;
                }
                return;
            }

            if (phase === 'defense') {
                if (isDefender) {
                    const ar = data.attack_roll || {}, attGrade = ar.grade ?? 0, canDodge = attGrade < 3;
                    const attName  = (attackerId === data.p1_id) ? p1.name : p2.name;
                    const attWName = data.chosen_weapon?.name || '맨손';
                    const sk = myData.skills || { brawl:25, sword:25, bow:25, throw:20, magic:15, dodge:(myData.dex||50)*2, drive:20 };
                    const counterSkill = data.chosen_weapon?.type ? sk[data.chosen_weapon.type] : sk.brawl;
                    box.innerHTML = `
                        <div style="background:rgba(20,20,20,0.8);border:1px solid rgba(204,204,204,0.3);border-radius:8px;padding:15px;box-sizing:border-box;width:100%;">
                            <div style="text-align:center;margin-bottom:15px;">
                                <div style="color:#aaa;font-size:0.9rem;margin-bottom:4px;"><b>${attName}</b>의 [${attWName}] 공격!</div>
                                <div style="color:${ar.gradeColor||'#fff'};font-weight:bold;font-size:1.3rem;text-shadow:0 0 5px ${ar.gradeColor||'transparent'};">${ar.gradeLabel||''} (${ar.roll})</div>
                                ${!canDodge ? `<div style="color:#888888;font-size:0.85rem;margin-top:6px;font-weight:bold;">극단적 성공 — 일반 회피 불가</div>` : ''}
                            </div>
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
                                ${canDodge
                                    ? `<button class="combat-btn combat-btn-defend" style="padding:12px;font-size:1rem;font-weight:bold;" onclick="CombatSys.rollDefense('dodge')">[ 일반 회피 ]<br><span style="font-size:0.8rem;font-weight:normal;">(${sk.dodge}%)</span></button>`
                                    : `<div style="padding:12px;background:rgba(100,100,100,0.1);border:1px solid rgba(100,100,100,0.3);border-radius:4px;color:#888888;text-align:center;display:flex;align-items:center;justify-content:center;font-size:0.9rem;">회피 불가</div>`}
                                <button class="combat-btn combat-btn-dodge" style="padding:12px;font-size:1rem;font-weight:bold;" onclick="CombatSys.rollDefense('counter')">[ 반 격 ]<br><span style="font-size:0.8rem;font-weight:normal;">(${counterSkill}%)</span></button>
                            </div>
                            <button class="combat-btn combat-btn-defend" style="width:100%;background:linear-gradient(135deg,#aaaaaa,#cccccc);color:#111;padding:12px;font-size:1rem;font-weight:bold;border:none;box-shadow:0 4px 6px rgba(0,0,0,0.3);" onclick="CombatSys.rollDefense('magic_dodge')">[ 자동차 운전 (긴급 회피) ]<br><span style="font-size:0.85rem;font-weight:normal;">[법력 5 소모] (${sk.drive}%)</span></button>
                        </div>`;
                } else if (isAttacker) {
                    const defName = (attackerId === data.p1_id) ? p2.name : p1.name;
                    box.innerHTML = `<div style="text-align:center;color:#888;width:100%;padding:20px;"><b>${defName}</b>의 방어 선택 대기 중...</div>`;
                } else {
                    box.innerHTML = `<div style="text-align:center;color:#888;width:100%;padding:20px;">처리 중...</div>`;
                }
            }
        },

        updateTeamArenaUI(tc) {
            if (!tc) return;
            const logBox = document.getElementById('combat-log');
            if (logBox && tc.log) { logBox.innerHTML = tc.log.map(l => `<div>${l}</div>`).join(''); logBox.scrollTop = logBox.scrollHeight; }
            const scEl = document.getElementById('spectator-count'); if (scEl) scEl.innerText = (tc.spectators||[]).length;
            const sideA = document.getElementById('team-side-a'), sideB = document.getElementById('team-side-b');
            if (sideA) this._renderTeamSide(tc, tc.team_a||[], sideA, 'a', tc);
            if (sideB) this._renderTeamSide(tc, tc.team_b||[], sideB, 'b', tc);
            this._renderTeamActionPanel(tc);
        },

        _renderTeamSide(tc, members, container, side, fullTc) {
            const myCharId   = currentUser ? charOwners[currentUser.email] : null;
            const isMyTurn   = tc.combat_phase === 'action' && tc.attacker_id === myCharId;
            const myTeamSide = this.myTeam, oppSide = side !== myTeamSide;
            container.innerHTML = members.map(m => {
                const hpPct = Math.max(0, Math.round((m.hp / m.maxHp) * 100));
                const mpPct = Math.max(0, Math.round(((m.mp ?? m.maxMp) / m.maxMp) * 100));
                const bpPct = Math.max(0, Math.round(((m.bp ?? m.maxBp) / m.maxBp) * 100));
                const hpColor   = hpPct > 60 ? 'high' : hpPct > 30 ? 'mid' : 'low';
                const isTarget  = tc.target_id   === m.id;
                const isActor   = tc.attacker_id === m.id;
                const isDead    = !m.alive || m.hp <= 0;
                const isFled    = m.fled;
                const clickable = isMyTurn && oppSide && m.alive && !m.fled;
                let cls = 'combatant-card';
                if (isActor && !isDead && !m.skipTurn) cls += ' acting';
                if (isDead)     cls += ' dead';
                if (isFled)     cls += ' fled';
                if (clickable)  cls += ' targetable';
                if (isTarget)   cls += ' selected-target';
                if (m.skipTurn) cls += ' skipped';
                return `<div class="${cls}" data-id="${m.id}" onclick="${clickable ? `CombatSys._selectTeamTarget('${m.id}')` : ''}">
                    <div class="turn-badge">${hpPct}%</div>
                    <img class="combatant-img" src="${m.img||PLACEHOLDER_100}" onerror="this.src='${PLACEHOLDER_100}'">
                    <div class="combatant-overlay">
                        <div class="combatant-name">${m.name}</div>
                        <div class="combatant-hp-bar"><div class="combatant-hp-fill" data-pct="${hpColor}" style="width:${hpPct}%"></div></div>
                        <div class="combatant-hp-bar" style="height:4px;margin-top:2px;background:rgba(0,0,0,0.5);"><div class="combatant-hp-fill" style="background:#777777;width:${mpPct}%"></div></div>
                        <div class="combatant-hp-bar" style="height:4px;margin-top:2px;background:rgba(0,0,0,0.5);"><div class="combatant-hp-fill" style="background:#cccccc;width:${bpPct}%"></div></div>
                    </div>
                    ${isDead || isFled ? '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:20;"></div>' : ''}
                </div>`;
            }).join('');
        },

        _selectTeamTarget(targetId) {
            const tc = this._latestTeam; if (!tc) return;
            const myCharId = charOwners[currentUser.email], me = this._findMember(tc, myCharId);
            if (!me) return;
            const target = this._findMember(tc, targetId);
            const sk = me.skills || { brawl:25, sword:25, bow:25, throw:20, magic:15, drive:20 };
            
            let wOpts = `<option value="__unarmed__">[격투] 맨손 격투 (1d3 / 기능치 ${sk.brawl}%)</option>`;
            (me.weapons || []).forEach((w, i) => {
                const wSkill   = sk[w.type] || sk.brawl;
                const typeName = w.type==='sword'?'도검':w.type==='bow'?'활':w.type==='throw'?'투척':w.type==='magic'?'도술':'격투';
                wOpts += `<option value="${i}">[${typeName}] ${w.name} (${w.dmg} / 기능치 ${wSkill}%)</option>`;
            });
            document.getElementById('combat-actions').innerHTML = `
                <div style="display:flex;gap:15px;background:rgba(20,20,20,0.8);border:1px solid rgba(204,204,204,0.3);border-radius:8px;padding:15px;box-sizing:border-box;width:100%;">
                    <div style="flex:1;display:flex;flex-direction:column;gap:10px;justify-content:center;">
                        <div style="color:#cccccc;font-size:0.9rem;font-weight:bold;letter-spacing:1px;margin-bottom:2px;">[ 대상: <b>${target?.name||'?'}</b> ]</div>
                        <select id="team-weapon-sel" class="combat-select" style="width:100%;box-sizing:border-box;padding:10px;font-size:0.9rem;background:#111;border:1px solid #444;color:#fff;">${wOpts}</select>
                        <label style="display:flex;align-items:center;justify-content:center;gap:6px;font-size:0.85rem;padding:10px;background:rgba(170,170,170,0.1);border:1px solid rgba(170,170,170,0.4);border-radius:6px;cursor:pointer;color:#aaaaaa;margin:0;">
                            <input type="checkbox" id="team-bp-boost" style="width:16px;height:16px;margin:0;cursor:pointer;">
                            <span style="font-weight:bold;">법력 5점 소비 (데미지 2배)</span>
                        </label>
                        <input type="hidden" id="team-target-hidden" value="${targetId}">
                    </div>
                    <div style="width:1px;background:rgba(204,204,204,0.2);"></div>
                    <div style="flex:1;display:flex;flex-direction:column;gap:8px;justify-content:center;">
                        <button class="combat-btn combat-btn-attack" style="width:100%;padding:14px;font-size:1.05rem;font-weight:bold;letter-spacing:1px;box-shadow:0 4px 6px rgba(0,0,0,0.3);" onclick="CombatSys.teamAttack()">공격 판정</button>
                        <div style="display:flex;gap:8px;">
                            <button class="combat-btn combat-btn-dodge"     style="flex:1;padding:8px;font-size:0.9rem;" onclick="CombatSys.teamFlee()">도주</button>
                            <button class="combat-btn combat-btn-surrender" style="flex:1;padding:8px;font-size:0.9rem;" onclick="CombatSys.teamSurrender()">항복</button>
                        </div>
                    </div>
                </div>`;
        },

        _renderTeamActionPanel(tc) {
            const box = document.getElementById('combat-actions'); if (!box) return;
            if (tc.status === 'finished' || tc.combat_phase === 'finished') {
                box.innerHTML = `<div style="color:var(--accent-color);font-weight:bold;text-align:center;width:100%;padding:8px;">팀전 종료!<br><br><button class="combat-btn combat-btn-dodge" style="width:100%;" onclick="CombatSys.forceExitArena()">나가기</button></div>`;
                return;
            }
            if (this.myRole === 'spectator') {
                box.innerHTML = `<div style="text-align:center;color:#888;width:100%;padding:20px;">관전 중...<br><br><button class="combat-btn combat-btn-surrender" style="width:100%;" onclick="CombatSys.forceExitArena()">관전 종료</button></div>`;
                return;
            }
            const myCharId = charOwners[currentUser.email];
            const phase = tc.combat_phase, isMyTurn = tc.attacker_id === myCharId, isMyDefense = tc.target_id === myCharId && phase === 'defense';
            const me = this._findMember(tc, myCharId);

            if (me?.skipTurn && (isMyTurn || isMyDefense)) {
                box.innerHTML = `<div style="text-align:center;color:#888888;font-weight:bold;width:100%;padding:20px;">이전 턴의 난입으로 인해 행동할 수 없습니다.</div>`;
                setTimeout(() => { if (isMyTurn) this._teamNextTurnAndSave(tc, [`<b>${me.name}</b>의 턴이 강제로 넘어갑니다.`]); }, 2000);
                return;
            }

            if (phase === 'action' && isMyTurn) {
                if (!me || !me.alive || me.fled) { box.innerHTML = `<div style="text-align:center;color:#888;width:100%;padding:20px;">대기 중...</div>`; return; }
                box.innerHTML = `<div style="display:flex;flex-direction:column;gap:12px;width:100%;">
                    <div style="color:#aaa;text-align:center;">상대 카드를 클릭해서 공격하세요.</div>
                    <div style="display:flex;gap:10px;">
                        <button class="combat-btn combat-btn-dodge"     style="flex:1;padding:12px;" onclick="CombatSys.teamFlee()">도주</button>
                        <button class="combat-btn combat-btn-surrender" style="flex:1;padding:12px;" onclick="CombatSys.teamSurrender()">항복</button>
                    </div>
                </div>`;
                return;
            }

            if (isMyDefense) {
                const att = this._findMember(tc, tc.attacker_id), ar = tc.attack_roll || {}, canDodge = (ar.grade || 0) < 3;
                const sk = me.skills || { brawl:25, sword:25, bow:25, throw:20, magic:15, dodge:(me.dex||50)*2, drive:20 };
                const counterSkill = tc.chosen_weapon?.type ? sk[tc.chosen_weapon.type] : sk.brawl;
                box.innerHTML = `
                    <div style="background:rgba(20,20,20,0.8);border:1px solid rgba(204,204,204,0.3);border-radius:8px;padding:15px;box-sizing:border-box;width:100%;">
                        <div style="text-align:center;margin-bottom:15px;">
                            <div style="color:#aaa;font-size:0.9rem;margin-bottom:4px;"><b>${att?.name||'?'}</b>의 [${tc.chosen_weapon?.name||'맨손'}] 공격!</div>
                            <div style="color:${ar.gradeColor||'#fff'};font-weight:bold;font-size:1.3rem;text-shadow:0 0 5px ${ar.gradeColor||'transparent'};">${ar.gradeLabel||''} (${ar.roll})</div>
                            ${!canDodge ? `<div style="color:#888888;font-size:0.85rem;margin-top:6px;font-weight:bold;">극단적 성공 — 일반 회피 불가</div>` : ''}
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
                            ${canDodge
                                ? `<button class="combat-btn combat-btn-defend" style="padding:12px;font-size:1rem;font-weight:bold;" onclick="CombatSys.teamDefend('dodge')">[ 일반 회피 ]<br><span style="font-size:0.8rem;font-weight:normal;">(${sk.dodge}%)</span></button>`
                                : `<div style="padding:12px;background:rgba(100,100,100,0.1);border:1px solid rgba(100,100,100,0.3);border-radius:4px;color:#888888;text-align:center;display:flex;align-items:center;justify-content:center;font-size:0.9rem;">회피 불가</div>`}
                            <button class="combat-btn combat-btn-dodge" style="padding:12px;font-size:1rem;font-weight:bold;" onclick="CombatSys.teamDefend('counter')">[ 반 격 ]<br><span style="font-size:0.8rem;font-weight:normal;">(${counterSkill}%)</span></button>
                        </div>
                        <button class="combat-btn combat-btn-defend" style="width:100%;background:linear-gradient(135deg,#aaaaaa,#cccccc);color:#111;padding:12px;font-size:1rem;font-weight:bold;border:none;box-shadow:0 4px 6px rgba(0,0,0,0.3);" onclick="CombatSys.teamDefend('magic_dodge')">[ 자동차 운전 (긴급 회피) ]<br><span style="font-size:0.85rem;font-weight:normal;">[법력 5 소모] (${sk.drive}%)</span></button>
                    </div>`;
                return;
            }

            if (phase === 'defense' && tc.target_id && tc.target_id !== myCharId && me?.alive && !me?.fled && !me?.skipTurn) {
                const targetAllies = (this.myTeam === 'a' ? tc.team_a : tc.team_b).find(m => m.id === tc.target_id);
                if (targetAllies) {
                    box.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;width:100%;">
                        <div style="text-align:center;color:#888;">아군이 공격받고 있습니다!</div>
                        <button class="combat-btn" style="background:#cccccc;color:#111;font-weight:bold;padding:10px;" onclick="CombatSys.teamGuard('${tc.target_id}')">[ 난입하여 대신 맞기 ] (다음 턴 희생)</button>
                    </div>`;
                    return;
                }
            }
            box.innerHTML = `<div style="text-align:center;color:#888;width:100%;padding:20px;">대기 중...</div>`;
        },

        _getCombat()  { return this.isDummyPractice ? this._dummyCombat : this._latestCombat; },
        async _updateCombat(updates) {
            if (this.isDummyPractice) { Object.assign(this._dummyCombat, updates); this.updateArenaUI(this._dummyCombat); return; }
            if (!this.currentCombatId) return;
            await supabaseClient.from('combats').update(updates).eq('id', this.currentCombatId);
        },

        async rollInitiative() {
            const combat = this._getCombat(); if (!combat) return;
            const p1 = combat.p1_data, p2 = combat.p2_data;
            const r1 = this._roll(p1.dex), r2 = this._roll(p2.dex);
            const logs = [...(combat.log || [])];
            logs.push(`[ ROUND ${combat.round} ]`);
            logs.push(`[선공] <b>${p1.name}</b> DEX(${p1.dex}) [주사위: ${r1.roll}] → <span style="color:${r1.color}">${r1.label}</span>`);
            logs.push(`[선공] <b>${p2.name}</b> DEX(${p2.dex}) [주사위: ${r2.roll}] → <span style="color:${r2.color}">${r2.label}</span>`);
            let attackerId = r1.grade !== r2.grade ? (r1.grade > r2.grade ? combat.p1_id : combat.p2_id) : (p1.dex >= p2.dex ? combat.p1_id : combat.p2_id);
            logs.push(`<b style="color:var(--accent-color)">${attackerId === combat.p1_id ? p1.name : p2.name}</b> 선공!`);
            await this._updateCombat({ combat_phase: 'attack', attacker_id: attackerId, log: logs });
        },

        async rollAttack() {
            const combat = this._getCombat(); if (!combat) return;
            const isP1 = this.myRole === 'p1';
            const myData  = { ...(isP1 ? combat.p1_data : combat.p2_data) };
            const sk = myData.skills || { brawl:25, sword:25, bow:25, throw:20, magic:15 };
            const weaponIdx = document.getElementById('attack-weapon-sel')?.value;
            const isBoost   = document.getElementById('attack-bp-boost')?.checked;
            let weapon;
            if (!weaponIdx || weaponIdx === '__unarmed__') weapon = { name: '맨손', dmg: '1d3', type: 'brawl', skill: sk.brawl };
            else { const w = myData.weapons[parseInt(weaponIdx)]; weapon = { name: w.name, dmg: w.dmg, type: w.type, skill: sk[w.type] || sk.brawl }; }
            if (isBoost) {
                if ((myData.bp ?? 0) < 5) return alert('법력이 부족합니다!');
                myData.bp -= 5;
            }
            const result = this._roll(weapon.skill), logs = [...(combat.log || [])];
            logs.push(`[공격] <b>${myData.name}</b> [${weapon.name}] ${isBoost ? '<span style="color:#cccccc">(법력 증폭)</span> ' : ''}[주사위: ${result.roll}] → <span style="color:${result.color}">${result.label}</span>`);
            
            const myDataKey = isP1 ? 'p1_data' : 'p2_data';
            let updates = { [myDataKey]: myData };
            if (result.grade === 4) {
                logs.push(`<span style="color:#cccccc;font-weight:bold;">대성공!</span> 방어 불가!`);
                Object.assign(updates, await this._applyDamage({ ...combat, [myDataKey]: myData }, charOwners[currentUser.email], weapon, result, logs, true, isBoost));
            } else if (result.grade <= 0) {
                logs.push(result.grade === 0 ? `빗나감.` : `대실패…`);
                Object.assign(updates, this._nextTurn(combat, logs));
            } else {
                Object.assign(updates, { combat_phase: 'defense', chosen_weapon: { ...weapon, isBoost }, attack_roll: { roll: result.roll, grade: result.grade, gradeLabel: result.label, gradeColor: result.color } });
            }
            await this._updateCombat({ ...updates, log: logs });
        },

        async rollDefense(type) {
            const combat = this._getCombat(); if (!combat) return;
            const isP1 = this.myRole === 'p1';
            const myData  = { ...(isP1 ? combat.p1_data : combat.p2_data) };
            const attData = { ...(isP1 ? combat.p2_data : combat.p1_data) };
            const attWeapon = combat.chosen_weapon || { name: '맨손', dmg: '1d3', type: 'brawl', skill: 25 };
            const attRoll   = combat.attack_roll   || { grade: 1 };
            const sk = myData.skills || { brawl:25, sword:25, bow:25, throw:20, magic:15, dodge:(myData.dex||50)*2, drive:20 };
            let skillVal = sk.dodge, label = '회피';
            if (type === 'counter')    { skillVal = sk[attWeapon.type] || sk.brawl; label = '반격'; }
            
            if (type === 'magic_dodge') {
                if ((myData.bp ?? 0) < 5) return alert('법력이 부족합니다!');
                myData.bp -= 5; skillVal = sk.drive; label = '자동차 운전(긴급 회피)';
            }
            
            const result = this._roll(skillVal), logs = [...(combat.log || [])];
            logs.push(`[${label}] <b>${myData.name}</b> [주사위: ${result.roll}] → <span style="color:${result.color}">${result.label}</span>`);
            const attGrade = attRoll.grade || 0, defGrade = result.grade, isAttEx = attGrade >= 3;
            const myDataKey = isP1 ? 'p1_data' : 'p2_data';
            
            let updates = { [myDataKey]: myData };
            const baseState = { ...combat, [myDataKey]: myData };
            if (type === 'dodge' || type === 'magic_dodge') {
                if (defGrade > 0 && defGrade >= attGrade) { logs.push(`회피 성공!`); Object.assign(updates, this._nextTurn(baseState, logs)); }
                else { logs.push(`회피 실패!`); Object.assign(updates, await this._applyDamage(baseState, combat.attacker_id, attWeapon, attRoll, logs, isAttEx, attWeapon.isBoost)); }
            } else {
                if (defGrade > attGrade) {
                    logs.push(`반격 성공!`);
                    Object.assign(updates, await this._applyDamage(baseState, charOwners[currentUser.email], { name:'반격', dmg:'1d3', type:'brawl', skill: sk.brawl }, result, logs, defGrade >= 3, false));
                } else if (defGrade === attGrade && defGrade > 0) {
                    logs.push(`반격 동률! 상호 피해를 입습니다!`);
                    const res1 = await this._applyDamage(baseState, combat.attacker_id, attWeapon, attRoll, logs, isAttEx, attWeapon.isBoost);
                    const res2 = await this._applyDamage({ ...baseState, ...res1 }, charOwners[currentUser.email], { name:'반격', dmg:'1d3', type:'brawl', skill: sk.brawl }, result, logs, defGrade >= 3, false);
                    Object.assign(updates, res2);
                } else {
                    logs.push(`반격 실패!`);
                    Object.assign(updates, await this._applyDamage(baseState, combat.attacker_id, attWeapon, attRoll, logs, isAttEx, attWeapon.isBoost));
                }
            }
            await this._updateCombat({ ...updates, log: logs });
        },

        async _applyDamage(combat, attackerCharId, weapon, attackRoll, logs, isCritical, isBoost) {
            const isP1att = combat.p1_id === attackerCharId;
            const attData = { ...(isP1att ? combat.p1_data : combat.p2_data) };
            const defData = { ...(isP1att ? combat.p2_data : combat.p1_data) };
            let weapDmg = this._rollDmg(weapon.dmg, isCritical);
            if (isBoost) weapDmg *= 2;
            const db = attData.db || { dice: 0, mod: 0 };
            let dbVal = db.mod;
            if (db.dice > 0) dbVal += isCritical ? db.dice : Math.floor(Math.random() * db.dice) + 1;
            const totalDmg = Math.max(0, weapDmg + dbVal);
            logs.push(`[ 타격 ] <b>${attData.name}</b> → <b style="color:#888888">총 ${totalDmg} 피해</b>`);
            defData.hp = (defData.hp ?? defData.maxHp) - totalDmg;
            let newStatus = combat.status;
            if (defData.hp <= 0) { defData.hp = 0; defData.alive = false; logs.push(`<b>${defData.name}</b> 의식 불명!`); newStatus = 'finished'; }
            else { logs.push(`<b>${defData.name}</b> 남은 HP: ${defData.hp}/${defData.maxHp}`); }
            const updates = {
                p1_data: isP1att ? attData : defData,
                p2_data: isP1att ? defData : attData,
                status: newStatus,
                chosen_weapon: null,
                attack_roll: null
            };
            if (newStatus === 'finished') updates.combat_phase = 'finished';
            else Object.assign(updates, this._nextTurn(combat, logs));
            return updates;
        },

        _nextTurn(combat, logs) {
            const nextAtt   = combat.attacker_id === combat.p1_id ? combat.p2_id : combat.p1_id;
            const nextRound = nextAtt === combat.p1_id ? combat.round + 1 : combat.round;
            if (nextAtt === combat.p1_id) logs.push(`[ ROUND ${nextRound} ]`);
            const pData = nextAtt === combat.p1_id ? combat.p1_data : combat.p2_data;
            if (pData.skipTurn) {
                logs.push(`<b>${pData.name}</b> 턴 소모로 행동 스킵.`);
                pData.skipTurn = false;
                return this._nextTurn({ ...combat, round: nextRound, attacker_id: nextAtt, [nextAtt === combat.p1_id ? 'p1_data' : 'p2_data']: pData }, logs);
            }
            logs.push(`[${pData.name}의 차례] 공격하세요.`);
            return { combat_phase: 'attack', attacker_id: nextAtt, chosen_weapon: null, attack_roll: null, round: nextRound };
        },

        async teamAttack() {
            const tc = this._latestTeam; if (!tc) return;
            const myCharId = charOwners[currentUser.email];
            const me = { ...this._findMember(tc, myCharId) };
            const targetId  = document.getElementById('team-target-hidden')?.value;
            const weaponIdx = document.getElementById('team-weapon-sel')?.value;
            const isBoost   = document.getElementById('team-bp-boost')?.checked;
            const sk = me.skills || { brawl:25, sword:25, bow:25, throw:20, magic:15 };
            let weapon;
            if (!weaponIdx || weaponIdx === '__unarmed__') weapon = { name: '맨손', dmg: '1d3', type: 'brawl', skill: sk.brawl };
            else { const w = me.weapons[parseInt(weaponIdx)]; weapon = { name: w.name, dmg: w.dmg, type: w.type, skill: sk[w.type] || sk.brawl }; }
            if (isBoost) {
                if ((me.bp ?? 0) < 5) return alert('법력이 부족합니다!');
                me.bp -= 5;
            }
            const result = this._roll(weapon.skill), logs = [...(tc.log || [])];
            logs.push(`[공격] <b>${me.name}</b> [${weapon.name}] ${isBoost ? '<span style="color:#cccccc">(법력 증폭)</span> ' : ''}[주사위: ${result.roll}] → <span style="color:${result.color}">${result.label}</span>`);
            const teamKey = this.myTeam === 'a' ? 'team_a' : 'team_b';
            let updates = { [teamKey]: (tc[teamKey] || []).map(m => m.id === myCharId ? { ...m, bp: me.bp } : m) };
            const tcWithBp = { ...tc, ...updates };
            if (result.grade === 4) {
                logs.push(`<span style="color:#cccccc;font-weight:bold;">대성공!</span>`);
                Object.assign(updates, await this._applyTeamDamage(tcWithBp, myCharId, targetId, weapon, result, logs, true, isBoost));
            } else if (result.grade <= 0) {
                logs.push(result.grade === 0 ? `빗나감.` : `대실패…`);
                Object.assign(updates, this._teamNextTurn(tcWithBp, logs));
            } else {
                Object.assign(updates, { combat_phase: 'defense', attacker_id: myCharId, target_id: targetId, chosen_weapon: { ...weapon, isBoost }, attack_roll: { roll: result.roll, grade: result.grade, gradeLabel: result.label, gradeColor: result.color } });
            }
            await supabaseClient.from('team_combats').update({ ...updates, log: logs }).eq('id', this.currentTeamId);
        },

        async teamDefend(type) {
            const tc = this._latestTeam; if (!tc) return;
            const myCharId = charOwners[currentUser.email];
            const me = { ...this._findMember(tc, myCharId) };
            const attWeapon = tc.chosen_weapon, attRoll = tc.attack_roll || { grade: 1 };
            const sk = me.skills || { brawl:25, sword:25, bow:25, throw:20, magic:15, dodge:(me.dex||50)*2, drive:20 };
            let skillVal = sk.dodge, label = '회피';
            if (type === 'counter')    { skillVal = sk[attWeapon.type] || sk.brawl; label = '반격'; }
            
            if (type === 'magic_dodge') {
                if ((me.bp ?? 0) < 5) return alert('법력이 부족합니다!');
                me.bp -= 5; skillVal = sk.drive; label = '자동차 운전(긴급 회피)';
            }
            
            const result = this._roll(skillVal), logs = [...(tc.log || [])];
            logs.push(`[${label}] <b>${me.name}</b> [주사위: ${result.roll}] → <span style="color:${result.color}">${result.label}</span>`);
            const attGrade = attRoll.grade || 0, defGrade = result.grade;
            const teamKey = this.myTeam === 'a' ? 'team_a' : 'team_b';
            let updates = { [teamKey]: (tc[teamKey] || []).map(m => m.id === myCharId ? { ...m, bp: me.bp } : m) };
            const tcWithBp = { ...tc, ...updates };
            
            if (type === 'dodge' || type === 'magic_dodge') {
                if (defGrade > 0 && defGrade >= attGrade) { logs.push(`회피 성공!`); Object.assign(updates, this._teamNextTurn(tcWithBp, logs)); }
                else { logs.push(`회피 실패!`); Object.assign(updates, await this._applyTeamDamage(tcWithBp, tc.attacker_id, myCharId, attWeapon, attRoll, logs, attGrade >= 3, attWeapon.isBoost)); }
            } else {
                if (defGrade > attGrade) {
                    logs.push(`반격 성공!`);
                    Object.assign(updates, await this._applyTeamDamage(tcWithBp, myCharId, tc.attacker_id, { name:'반격', dmg:'1d3', type:'brawl', skill: sk.brawl }, result, logs, defGrade >= 3, false));
                } else if (defGrade === attGrade && defGrade > 0) {
                    logs.push(`반격 동률! 상호 피해!`);
                    const res1 = await this._applyTeamDamage(tcWithBp, tc.attacker_id, myCharId, attWeapon, attRoll, logs, attGrade >= 3, attWeapon.isBoost);
                    const res2 = await this._applyTeamDamage({ ...tcWithBp, ...res1 }, myCharId, tc.attacker_id, { name:'반격', dmg:'1d3', type:'brawl', skill: sk.brawl }, result, logs, defGrade >= 3, false);
                    Object.assign(updates, res2);
                } else {
                    logs.push(`반격 실패!`);
                    Object.assign(updates, await this._applyTeamDamage(tcWithBp, tc.attacker_id, myCharId, attWeapon, attRoll, logs, attGrade >= 3, attWeapon.isBoost));
                }
            }
            await supabaseClient.from('team_combats').update({ ...updates, log: logs }).eq('id', this.currentTeamId);
        },

        async teamGuard(targetId) {
            const tc = this._latestTeam; if (!tc) return;
            const myCharId = charOwners[currentUser.email];
            const me = this._findMember(tc, myCharId), target = this._findMember(tc, targetId);
            const logs = [...(tc.log || [])];
            logs.push(`[ 난입 ] <b>${me.name}</b> 가 <b>${target.name}</b> 대신 맞습니다!`);
            const teamKey = this.myTeam === 'a' ? 'team_a' : 'team_b';
            const updates = { target_id: myCharId, [teamKey]: (tc[teamKey] || []).map(m => m.id === myCharId ? { ...m, skipTurn: true } : m) };
            await supabaseClient.from('team_combats').update({ ...updates, log: logs }).eq('id', this.currentTeamId);
        },

        async _applyTeamDamage(tc, attackerCharId, defenderCharId, weapon, attackRoll, logs, isCritical, isBoost) {
            const att = this._findMember(tc, attackerCharId), def = this._findMember(tc, defenderCharId);
            let weapDmg = this._rollDmg(weapon.dmg, isCritical); if (isBoost) weapDmg *= 2;
            const db = att?.db || { dice: 0, mod: 0 };
            let dbVal = db.mod; if (db.dice > 0) dbVal += isCritical ? db.dice : Math.floor(Math.random() * db.dice) + 1;
            const totalDmg = Math.max(0, weapDmg + dbVal);
            logs.push(`[ 타격 ] <b>${att?.name||'?'}</b> → <b style="color:#888888">총 ${totalDmg} 피해</b>`);
            this._hitEffect(defenderCharId, totalDmg);
            let newTeamA = [...(tc.team_a || [])], newTeamB = [...(tc.team_b || [])];
            const applyHp = m => { const nm = { ...m }; nm.hp = (nm.hp ?? nm.maxHp) - totalDmg; if (nm.hp <= 0) { nm.hp = 0; nm.alive = false; } return nm; };
            const defTeam = (tc.team_a || []).some(m => m.id === defenderCharId) ? 'a' : 'b';
            if (defTeam === 'a') newTeamA = newTeamA.map(m => m.id === defenderCharId ? applyHp(m) : m);
            else                 newTeamB = newTeamB.map(m => m.id === defenderCharId ? applyHp(m) : m);
            const defAfter = (defTeam === 'a' ? newTeamA : newTeamB).find(m => m.id === defenderCharId);
            if (!defAfter.alive) {
                logs.push(`<b>${defAfter.name}</b> 전사!`);
                setTimeout(() => this._deathEffect(defenderCharId), 100);
                if (this._teamDead(newTeamA)) { logs.push(`[ TEAM B 승리! ]`); return { team_a: newTeamA, team_b: newTeamB, status: 'finished', combat_phase: 'finished', chosen_weapon: null, attack_roll: null }; }
                if (this._teamDead(newTeamB)) { logs.push(`[ TEAM A 승리! ]`); return { team_a: newTeamA, team_b: newTeamB, status: 'finished', combat_phase: 'finished', chosen_weapon: null, attack_roll: null }; }
            }
            return { team_a: newTeamA, team_b: newTeamB, ...this._teamNextTurn({ ...tc, team_a: newTeamA, team_b: newTeamB }, logs) };
        },

        _teamNextTurn(tc, logs) {
            const order = tc.turn_order || []; if (!order.length) return { combat_phase: 'finished' };
            let idx = tc.current_turn_idx ?? 0; idx = (idx + 1) % order.length; let tries = 0;
            while (tries < order.length) {
                const candidate = order[idx], m = this._findMember(tc, candidate.id);
                if (m && m.alive && !m.fled) break;
                idx = (idx + 1) % order.length; tries++;
            }
            if (tries >= order.length) return { combat_phase: 'finished', status: 'finished' };
            const next = order[idx], nextM = this._findMember(tc, next.id);
            if (nextM?.skipTurn) {
                logs.push(`<b>${next.name}</b> 난입 페널티로 턴 스킵.`);
                const teamKey = next.team === 'a' ? 'team_a' : 'team_b';
                tc[teamKey] = (tc[teamKey] || []).map(m => m.id === next.id ? { ...m, skipTurn: false } : m);
                tc.current_turn_idx = idx;
                return this._teamNextTurn(tc, logs);
            }
            logs.push(`[${next.team === 'a' ? 'TEAM A' : 'TEAM B'}] <b>${next.name}</b>의 차례.`);
            return { combat_phase: 'action', current_turn_idx: idx, attacker_id: next.id, target_id: null, chosen_weapon: null, attack_roll: null, team_a: tc.team_a, team_b: tc.team_b };
        },
        async _teamNextTurnAndSave(tc, extraLogs) {
            const logs = [...(tc.log || []), ...(extraLogs || [])];
            const updates = this._teamNextTurn(tc, logs);
            await supabaseClient.from('team_combats').update({ ...updates, log: logs }).eq('id', tc.id);
        },

        async bet(side) {
            if (!currentUser) return alert('로그인이 필요합니다.');
            if (this.isDummyPractice) return alert('연습 대련에서는 베팅할 수 없습니다.');
            const myCharId = charOwners[currentUser.email];
            const myName   = charData.find(c => `char-${c.id}` === myCharId)?.name || '익명';
            const amtEl    = document.getElementById(`bet-amt-${side}`);
            const amount   = parseInt(amtEl?.value || '0');
            if (!amount || amount <= 0) return alert('베팅 금액을 입력하세요.');
            const combat = this._latestCombat; if (!combat) return alert('대련 정보가 없습니다.');
            const bets = combat.bets || { p1: [], p2: [] };
            const already = [...(bets.p1 || []), ...(bets.p2 || [])].find(b => b.charId === myCharId);
            if (already) return alert('이미 베팅하셨습니다.');
            const { data: profile } = await supabaseClient.from('character_profiles').select('money').eq('char_id', myCharId).eq('phase', 0).single();
            const myMoney = profile?.money ? parseInt(String(profile.money).replace(/,/g,''), 10) : 0;
            if (myMoney < amount) return alert(`소지금 부족! (보유: ${myMoney.toLocaleString()} G)`);
            await supabaseClient.from('character_profiles').update({ money: myMoney - amount }).eq('char_id', myCharId).eq('phase', 0);
            const newBets = { p1: [...(bets.p1 || [])], p2: [...(bets.p2 || [])] };
            newBets[side].push({ charId: myCharId, name: myName, amount });
            await supabaseClient.from('combats').update({ bets: newBets }).eq('id', this.currentCombatId);
            if (amtEl) amtEl.value = '';
            alert(`[확인] ${side.toUpperCase()} 진영에 ${amount.toLocaleString()} G 베팅 완료!`);
            this._renderMyMoney();
        },

        async _renderMyMoney() {
            if (!currentUser || !supabaseClient) return;
            const myCharId = charOwners[currentUser.email]; if (!myCharId) return;
            const { data } = await supabaseClient.from('character_profiles').select('money').eq('char_id', myCharId).eq('phase', 0).single();
            const money = data?.money ? parseInt(String(data.money).replace(/,/g,''), 10) : 0;
            const fmt   = money.toLocaleString() + ' G';
            const el1 = document.getElementById('bet-my-money-p1'); if (el1) el1.innerText = fmt;
            const el2 = document.getElementById('bet-my-money-p2'); if (el2) el2.innerText = fmt;
        },

        async soloFlee() {
            const combat = this._getCombat(); if (!combat || !confirm('도주하시겠습니까?')) return;
            const md = (this.myRole === 'p1') ? combat.p1_data : combat.p2_data;
            const r = this._roll(md.dex * 2), l = [...(combat.log || [])];
            l.push(`[도주] <b>${md.name}</b> [주사위: ${r.roll}]`);
            if (r.grade > 0) { l.push(`도주 성공!`); await this._updateCombat({ status: 'finished', combat_phase: 'finished', log: l }); }
            else             { l.push(`도주 실패!`); await this._updateCombat({ ...this._nextTurn(combat, l), log: l }); }
        },
        async surrender() {
            const c = this._getCombat(); if (!c || !confirm('항복하시겠습니까?')) return;
            const i = (this.myRole === 'p1'), m = i ? { ...c.p1_data } : { ...c.p2_data };
            m.hp = 0; const l = [...(c.log || [])]; l.push(`[ 항복 ] <b>${m.name}</b>!`);
            await this._updateCombat({ p1_data: i ? m : c.p1_data, p2_data: i ? c.p2_data : m, status: 'finished', combat_phase: 'finished', log: l });
        },
        async teamFlee() {
            const tc = this._latestTeam; if (!tc || !confirm('도주하시겠습니까?')) return;
            const mid = charOwners[currentUser.email], m = this._findMember(tc, mid);
            const r = this._roll((m.dex || 50) * 2), l = [...(tc.log || [])];
            l.push(`[도주] <b>${m.name}</b> [주사위: ${r.roll}]`);
            if (r.grade > 0) {
                l.push(`도주 성공!`);
                const tk = this.myTeam === 'a' ? 'team_a' : 'team_b';
                const ut = (tc[tk] || []).map(x => x.id === mid ? { ...x, fled: true } : x);
                let u = { [tk]: ut };
                if (this._teamDead(ut)) { u.status = 'finished'; u.combat_phase = 'finished'; }
                else Object.assign(u, this._teamNextTurn({ ...tc, ...u }, l));
                await supabaseClient.from('team_combats').update({ ...u, log: l }).eq('id', tc.id);
            } else {
                l.push(`도주 실패!`);
                await supabaseClient.from('team_combats').update({ ...this._teamNextTurn(tc, l), log: l }).eq('id', tc.id);
            }
        },
        async teamSurrender() {
            const tc = this._latestTeam; if (!tc || !confirm('항복하시겠습니까?')) return;
            const mid = charOwners[currentUser.email], l = [...(tc.log || [])];
            const tk = this.myTeam === 'a' ? 'team_a' : 'team_b';
            const ut = (tc[tk] || []).map(x => x.id === mid ? { ...x, alive: false, hp: 0 } : x);
            l.push(`[ 항복 ] <b>${this._findMember(tc, mid)?.name||'?'}</b>!`);
            let u = { [tk]: ut };
            if (this._teamDead(ut)) { u.status = 'finished'; u.combat_phase = 'finished'; }
            else Object.assign(u, this._teamNextTurn({ ...tc, ...u }, l));
            await supabaseClient.from('team_combats').update({ ...u, log: l }).eq('id', tc.id);
        },

        async exitArena() {
            const t = this.mode === 'team' ? 'team_combats' : 'combats';
            const c = this.mode === 'team' ? this.currentTeamId : this.currentCombatId;
            if (this.myRole !== 'spectator' && !this.isDummyPractice && confirm('방을 폭파하시겠습니까?\n(모든 참가자가 로비로 돌아갑니다)'))
                await supabaseClient.from(t).delete().eq('id', c);
            this.forceExitArena();
        },
        forceExitArena() {
            if (this.arenaChannel) { try { supabaseClient.removeChannel(this.arenaChannel); } catch(e) {} }
            this.currentCombatId = null; this.currentTeamId = null; this.myRole = 'spectator'; this.myTeam = null; this.isDummyPractice = false;
            const a = document.getElementById('sparring-arena'); if (a) a.style.display = 'none';
            if (this.mode === 'team') this._renderTeamLobby(); else this.loadLobby();
            this._startLobbyWatch();
        }
    };

    window.CombatSys = CombatSys;
})();
