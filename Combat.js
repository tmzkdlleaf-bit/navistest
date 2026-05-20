/* ================================================================= */
/*  Combat.js — 대련장 전투 시스템 (개인전 & 단체전)                    */
/*                                                                   */
/*  이 파일이 담당하는 일:                                             */
/*  1. 로비 (대련 신청, 수락, 관전)                                    */
/*  2. 개인전 전투 진행 (이니셔티브 → 공격 → 방어 → 턴 반복)            */
/*  3. 단체전 팀 구성 & 전투                                           */
/*  4. 목인장 연습 모드 (AI 상대)                                      */
/*  5. Supabase Realtime으로 상대방 화면 실시간 동기화                  */
/*  6. 베팅 시스템                                                    */
/*                                                                   */
/*  전투 판정 규칙 (COC 7판 기반):                                     */
/*  - 1d100을 굴려 기능치 이하면 성공                                  */
/*  - 기능치/5 이하: 극단적 성공 / 기능치/2 이하: 어려운 성공           */
/*  - 1: 결정적 성공 / 96~100(기능치<50) or 100(기능치≥50): 대실패    */
/*                                                                   */
/*  ✏️  수정 포인트:                                                   */
/*  - 목인장 난이도: DUMMY_PRESETS 배열                                */
/*  - 법력 소비 효과: rollAttack() 안의 isBoost 관련 코드              */
/* ================================================================= */

(function () {
    'use strict';

    /* 이미지가 없을 때 사용할 기본 이미지 */
    const PLACEHOLDER_100 = 'https://placehold.co/100x100/111/888?text=No+Img';

    /* ─────────────────────────────────────────────────────────────
       CombatSys — 전투 시스템 전체를 담당하는 객체
       window.CombatSys 로 외부에서 접근합니다.
    ───────────────────────────────────────────────────────────── */
    const CombatSys = {

        /* 현재 모드: 'solo'(개인전) | 'team'(단체전) */
        mode: 'solo',

        /* Supabase Realtime 채널 (상대방과 실시간 동기화) */
        arenaChannel: null,

        /* 현재 사용자의 역할: 'p1' | 'p2' | 'spectator'(관전) */
        myRole: 'spectator',

        /* 로비 자동 새로고침 인터벌 ID */
        lobbyInterval: null,

        /* 최신 전투 데이터 (Realtime으로 계속 업데이트됨) */
        _latestCombat: null,
        _latestTeam:   null,

        /* 현재 참여 중인 전투 ID */
        currentCombatId: null,

        /* 목인장 연습 모드 여부 */
        isDummyPractice: false,
        _dummyCombat:    null,

        /* 단체전 ID & 내 팀 ('a' | 'b' | 'spectator') */
        currentTeamId: null,
        myTeam:        null,

        /* 팀 구성 버튼에서 선택한 팀원 목록 */
        _teamBuilderA: [],
        _teamBuilderB: [],

        /*
         * 목인장 연습 상대 프리셋
         * ✏️  난이도를 조정하고 싶으면 hp, stats 수치를 변경하세요
         */
        DUMMY_PRESETS: [
            {
                name: '목인장 (쉬움)',
                hp: 5, maxHp: 5, mp: 5, maxMp: 5, bp: 10, maxBp: 10,
                str: 35, con: 45, siz: 45, dex: 35,
                skills: { brawl: 20, sword: 20, bow: 20, throw: 15, magic: 10, dodge: 15, drive: 15 },
                db: { dice: 0, mod: 0, label: '없음' },
                weapons: [{ name: '나무 주먹', dmg: '1d3', type: 'brawl' }],
                img: PLACEHOLDER_100,
            },
            {
                name: '목인장 (보통)',
                hp: 9, maxHp: 9, mp: 8, maxMp: 8, bp: 20, maxBp: 20,
                str: 55, con: 60, siz: 60, dex: 50,
                skills: { brawl: 45, sword: 45, bow: 45, throw: 35, magic: 25, dodge: 35, drive: 35 },
                db: { dice: 0, mod: 0, label: '없음' },
                weapons: [{ name: '나무 주먹', dmg: '1d4', type: 'brawl' }],
                img: PLACEHOLDER_100,
            },
            {
                name: '목인장 (어려움)',
                hp: 13, maxHp: 13, mp: 15, maxMp: 15, bp: 30, maxBp: 30,
                str: 75, con: 75, siz: 70, dex: 65,
                skills: { brawl: 65, sword: 65, bow: 65, throw: 55, magic: 45, dodge: 55, drive: 55 },
                db: { dice: 4, mod: 0, label: '+1d4' },
                weapons: [{ name: '나무 주먹', dmg: '1d6', type: 'brawl' }],
                img: PLACEHOLDER_100,
            },
        ],


        /* ─────────────────────────────────────────────────────────
           주사위 & 판정 유틸
        ───────────────────────────────────────────────────────── */

        /**
         * 1d100을 굴려 기능치(skill)와 비교합니다.
         * COC 7판 기준 성공/실패 등급을 반환합니다.
         *
         * 반환값:
         *   { roll, grade, label, color }
         *   grade: 4(결정적성공) / 3(극단적) / 2(어려운) / 1(보통) / 0(실패) / -1(대실패)
         */
        _roll(skill) {
            const roll   = Math.floor(Math.random() * 100) + 1;
            const ex     = Math.floor(skill / 5);   /* 극단적 성공 임계값 */
            const hd     = Math.floor(skill / 2);   /* 어려운 성공 임계값 */
            const fumble = skill < 50 ? 96 : 100;   /* 대실패 임계값 */

            if (roll === 1)        return { roll, grade:  4, label: '결정적 성공!', color: '#ffffff' };
            if (roll >= fumble)    return { roll, grade: -1, label: '대실패…',      color: '#ff6666' };
            if (roll <= ex)        return { roll, grade:  3, label: '극단적 성공',  color: '#cccccc' };
            if (roll <= hd)        return { roll, grade:  2, label: '어려운 성공',  color: '#aaaaaa' };
            if (roll <= skill)     return { roll, grade:  1, label: '보통 성공',    color: '#888888' };
            return                        { roll, grade:  0, label: '실패',         color: '#555555' };
        },

        /**
         * 근력(str) + 크기(siz) 합산으로 피해 보너스(Damage Bonus)를 계산합니다.
         * COC 7판 기준 테이블입니다.
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
         * 주사위 표기법(예: '1d6', '2d8+2')으로 피해를 굴립니다.
         *
         * 매개변수:
         *   dmgStr  : '1d6' 형식 문자열
         *   maxRoll : true이면 최대값 반환 (크리티컬 처리용)
         */
        _rollDmg(dmgStr, maxRoll = false) {
            const m = String(dmgStr).toLowerCase().match(/(\d+)d(\d+)([+-]\d+)?/);
            if (!m) return maxRoll ? 3 : Math.floor(Math.random() * 3) + 1; /* 파싱 실패 시 기본 1d3 */

            const cnt = parseInt(m[1]); /* 주사위 개수 */
            const sid = parseInt(m[2]); /* 주사위 면수 */
            const bon = m[3] ? parseInt(m[3]) : 0; /* 보정값 */

            if (maxRoll) return (cnt * sid) + bon; /* 최대값 */

            let total = bon;
            for (let i = 0; i < cnt; i++) total += Math.floor(Math.random() * sid) + 1;
            return total;
        },

        /**
         * Config.js의 charData와 allProfiles(DB 데이터)를 합쳐
         * 전투에 필요한 캐릭터 데이터 객체를 만듭니다.
         *
         * 매개변수:
         *   charId   : 'char-가나' 형식의 캐릭터 ID
         *   reqPhase : 사용할 챕터 인덱스 (undefined이면 globalMainPhase)
         */
        _buildCharData(charId, reqPhase) {
            const targetPhase = reqPhase !== undefined ? reqPhase : (window.globalMainPhase || 0);
            const profile     = allProfiles.find(p => p.char_id === charId && p.phase === targetPhase);
            const base        = charData.find(c => `char-${c.id}` === charId);

            /* 능력치 파싱 */
            const st  = ((profile?.stats) || base?.stats || '50,50,50,50,50,50,50,50').split(',').map(Number);
            const str = st[0]||50, con = st[1]||50, siz = st[2]||50, dex = st[3]||50, pow = st[6]||50;

            /* HP/MP 계산 */
            const maxHp = Math.round((con + siz) / 10);
            const maxMp = Math.floor(pow / 5);
            let   maxBp = pow; /* 법력: 기본은 정신력(POW) 값 */

            /* 기본 기능치 (weapon_data가 없을 때 사용) */
            let b = 25, s = 25, bw = 25, t = 20, m = 15, do_ = dex * 2, dr = 20;
            let weapons = [];

            /* weapon_data가 있으면 파싱해서 덮어씌우기 */
            if (profile?.weapon_data) {
                try {
                    const w = JSON.parse(profile.weapon_data);
                    b  = w.brawl || 25; s  = w.sword || 25; bw = w.bow   || 25;
                    t  = w.throw || 20; m  = w.magic || 15; do_= w.dodge || (dex * 2);
                    dr = w.drive || 20; weapons = w.weapons || [];
                    if (w.bp && w.bp > 0) maxBp = w.bp;
                } catch (e) {}
            }

            return {
                id:      charId,
                name:    base?.name || charId,
                img:     profile?.combat_img || profile?.profile_image || base?.img || PLACEHOLDER_100,
                hp: maxHp, maxHp,
                mp: maxMp, maxMp,
                bp: maxBp, maxBp,
                str, con, siz, dex,
                skills: { brawl: b, sword: s, bow: bw, throw: t, magic: m, dodge: do_, drive: dr },
                db:     this._damageBonus(str, siz),
                weapons,
                alive: true, fled: false, skipTurn: false,
            };
        },

        /* 팀 전체가 전멸(alive=false or fled=true)인지 확인 */
        _teamDead(members) {
            return members.every(m => !m.alive || m.fled);
        },

        /* 피격 이펙트: 카드를 흔들고 피해 숫자 팝업 */
        _hitEffect(charId, damage) {
            const card = document.querySelector(`.combatant-card[data-id="${charId}"]`);
            if (!card) return;
            card.classList.remove('hit');
            void card.offsetWidth; /* 리플로우 강제 → 애니메이션 재시작 */
            card.classList.add('hit');
            setTimeout(() => card.classList.remove('hit'), 600);

            /* 피해 숫자 팝업 생성 */
            const popup       = document.createElement('div');
            popup.className   = 'dmg-popup';
            popup.textContent = `-${damage}`;
            card.appendChild(popup);
            setTimeout(() => popup.remove(), 1100);
        },

        /* 사망 이펙트 */
        _deathEffect(charId) {
            const card = document.querySelector(`.combatant-card[data-id="${charId}"]`);
            if (card) {
                card.classList.add('dying');
                setTimeout(() => card.classList.add('dead'), 900);
            }
        },


        /* ─────────────────────────────────────────────────────────
           로비 시스템
        ───────────────────────────────────────────────────────── */

        /**
         * 개인전/단체전 모드를 전환합니다.
         * 상단 탭 버튼(Solo/Team)에서 호출됩니다.
         */
        switchMode(mode) {
            this.mode = mode;

            /* 탭 버튼 active 상태 */
            document.querySelectorAll('.combat-mode-btn').forEach(b => b.classList.remove('active'));
            document.querySelector(`.combat-mode-btn[data-mode="${mode}"]`)?.classList.add('active');

            /* 해당 로비 영역 표시/숨김 */
            document.getElementById('lobby-solo').style.display = mode === 'solo' ? '' : 'none';
            document.getElementById('lobby-team').style.display = mode === 'team' ? '' : 'none';

            /* 전장 영역 전환 */
            const soloStage = document.getElementById('solo-arena-stage');
            const teamStage = document.getElementById('team-arena-stage');
            if (soloStage) soloStage.style.display = mode === 'solo' ? '' : 'none';
            if (teamStage) teamStage.style.display  = mode === 'team' ? '' : 'none';

            if (mode === 'team') this._renderTeamLobby();
            else                 this.loadLobby();
        },

        /**
         * 대련 상대 드롭다운을 캐릭터 목록으로 채웁니다.
         * 페이지 로드 후 한 번 호출됩니다.
         */
        initDropdowns() {
            if (!currentUser || !supabaseClient) return;
            const sel      = document.getElementById('spar-target');
            if (!sel) return;
            const myCharId = charOwners[currentUser.email];

            sel.innerHTML = '<option value="">대련 상대를 선택하세요</option>';

            /* 실제 캐릭터 목록 */
            const realGroup = document.createElement('optgroup');
            realGroup.label = '── 캐릭터 ──';
            [...charData]
                .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
                .forEach(c => {
                    if (`char-${c.id}` !== myCharId) {
                        const o     = document.createElement('option');
                        o.value     = `char-${c.id}`;
                        o.innerText = c.name;
                        realGroup.appendChild(o);
                    }
                });
            sel.appendChild(realGroup);

            /* 목인장 연습 */
            const dummyGroup = document.createElement('optgroup');
            dummyGroup.label = '── 연습 상대 ──';
            this.DUMMY_PRESETS.forEach((p, i) => {
                const o     = document.createElement('option');
                o.value     = `dummy_${i}`;
                o.innerText = p.name;
                dummyGroup.appendChild(o);
            });
            sel.appendChild(dummyGroup);

            this.loadLobby();
            this._startLobbyWatch();
        },

        /**
         * 로비(진행 중인 대련 목록)를 DB에서 불러와 표시합니다.
         * 3초마다 자동으로 갱신됩니다.
         */
        async loadLobby() {
            if (!supabaseClient || !currentUser) return;
            const myCharId = charOwners[currentUser.email];

            /* 대기 중 + 진행 중 대련 목록 조회 */
            const { data: combats } = await supabaseClient
                .from('combats')
                .select('*')
                .in('status', ['waiting', 'ongoing'])
                .order('created_at', { ascending: false });

            const inB  = document.getElementById('spar-incoming-requests');
            const onB  = document.getElementById('spar-ongoing-list');
            if (!inB || !onB) return;

            /* 캐릭터 이름 매핑 테이블 */
            const nm = {};
            charData.forEach(c => { nm[`char-${c.id}`] = c.name; });

            let inH = '', onH = '';
            (combats || []).forEach(c => {
                const p1 = nm[c.p1_id] || c.p1_id;
                const p2 = nm[c.p2_id] || c.p2_id;

                if (c.status === 'waiting') {
                    if (c.p2_id === myCharId) {
                        /* 나에게 온 신청 */
                        inH += `<div class="modern-card">
                            <div class="modern-card-content">
                                <span class="modern-badge badge-incoming">REQUEST</span>
                                <span class="modern-card-title">${p1}</span>
                                <span class="modern-card-desc">대련을 신청했습니다.</span>
                            </div>
                            <button class="modern-action-btn btn-solid-accept" onclick="CombatSys.acceptChallenge('${c.id}')">수락</button>
                        </div>`;
                    } else if (c.p1_id === myCharId) {
                        /* 내가 신청한 것 */
                        inH += `<div class="modern-card">
                            <div class="modern-card-content">
                                <span class="modern-badge badge-waiting">WAITING</span>
                                <span class="modern-card-title">${p2}</span>
                                <span class="modern-card-desc">수락 대기 중...</span>
                            </div>
                            <button class="modern-action-btn btn-solid-cancel" onclick="CombatSys.cancelChallenge('${c.id}')">취소</button>
                        </div>`;
                    }
                } else if (c.status === 'ongoing') {
                    /* 진행 중인 대련 (관전 가능) */
                    onH += `<div class="modern-card">
                        <div class="modern-card-content">
                            <span class="modern-badge badge-live">LIVE</span>
                            <span class="modern-card-title">${p1} <span class="modern-vs">VS</span> ${p2}</span>
                        </div>
                        <button class="modern-action-btn btn-solid-spectate" onclick="CombatSys.joinArena('${c.id}')">관전</button>
                    </div>`;
                }
            });

            const emptyMsg = (text) => `<div class="modern-empty-card">${text}</div>`;
            inB.innerHTML = inH || emptyMsg('요청 내역이 없습니다.');
            onB.innerHTML = onH || emptyMsg('진행 중인 대련이 없습니다.');
        },

        /* 3초마다 로비 자동 갱신 시작 */
        _startLobbyWatch() {
            if (this.lobbyInterval) { clearInterval(this.lobbyInterval); this.lobbyInterval = null; }
            this.lobbyInterval = setInterval(() => {
                const arena = document.getElementById('sparring-arena');
                if (!arena || arena.style.display === 'none') {
                    if (this.mode === 'solo') this.loadLobby();
                    else this._renderTeamLobby();
                }
            }, 3000);
        },

        /* 로비 자동 갱신 정지 */
        _stopLobbyWatch() {
            if (this.lobbyInterval) { clearInterval(this.lobbyInterval); this.lobbyInterval = null; }
        },


        /* ─────────────────────────────────────────────────────────
           개인전 신청/수락/취소
        ───────────────────────────────────────────────────────── */

        /**
         * 대련을 신청합니다.
         * 드롭다운에서 상대를 선택하고 '대련' 버튼을 누르면 호출됩니다.
         */
        async challenge() {
            if (!currentUser) { alert('로그인이 필요합니다.'); return; }
            const selVal = document.getElementById('spar-target')?.value;
            if (!selVal) { alert('대련 상대를 선택하세요.'); return; }

            /* 목인장이면 연습 모드로 */
            if (selVal.startsWith('dummy_')) {
                this.startDummyPractice(parseInt(selVal.replace('dummy_', '')));
                return;
            }

            const myCharId    = charOwners[currentUser.email];
            const myPhase     = window.combatRequestedPhases?.myPhase     ?? window.globalMainPhase ?? 0;
            const targetPhase = window.combatRequestedPhases?.targetPhase ?? window.globalMainPhase ?? 0;

            /* 양쪽 캐릭터 데이터 빌드 */
            const p1data = this._buildCharData(myCharId, myPhase);
            const p2data = this._buildCharData(selVal,   targetPhase);

            /* DB에 대련 레코드 생성 */
            const { error } = await supabaseClient.from('combats').insert([{
                p1_id:        myCharId,
                p2_id:        selVal,
                status:       'waiting',
                combat_phase: 'initiative',
                attacker_id:  null,
                round:        1,
                p1_data:      p1data,
                p2_data:      p2data,
                spectators:   [],
                bets:         { p1: [], p2: [] },
                log:          [`[ ${p1data.name} VS ${p2data.name} ] 대련 신청`],
            }]);

            if (error) { console.error(error); alert('신청 실패'); return; }
            alert('대련 신청 완료!');
            this.loadLobby();
        },

        /* 대련 신청을 취소합니다 */
        async cancelChallenge(id) {
            if (!confirm('신청을 취소하시겠습니까?')) return;
            await supabaseClient.from('combats').delete().eq('id', id);
            this.loadLobby();
        },

        /* 대련 신청을 수락하고 전장에 입장합니다 */
        async acceptChallenge(id) {
            await supabaseClient.from('combats').update({ status: 'ongoing' }).eq('id', id);
            this.joinArena(id);
        },


        /* ─────────────────────────────────────────────────────────
           전장 입장 (개인전)
        ───────────────────────────────────────────────────────── */

        /**
         * 전장 모달을 열고 Realtime 채널을 구독합니다.
         *
         * 매개변수:
         *   combatId : combats 테이블의 id
         */
        async joinArena(combatId) {
            if (!currentUser) { alert('로그인이 필요합니다.'); return; }
            this._stopLobbyWatch();
            this.mode             = 'solo';
            this.isDummyPractice  = false;
            this.currentCombatId  = combatId;
            this.currentTeamId    = null;

            const myCharId = charOwners[currentUser.email];
            const { data: combat, error } = await supabaseClient
                .from('combats').select('*').eq('id', combatId).single();

            if (error || !combat) { alert('대련 정보를 찾을 수 없습니다.'); return; }
            this._latestCombat = combat;

            /* 역할 결정 */
            if      (combat.p1_id === myCharId) this.myRole = 'p1';
            else if (combat.p2_id === myCharId) this.myRole = 'p2';
            else {
                this.myRole = 'spectator';
                /* 관전자 목록에 추가 */
                const myName = charData.find(c => `char-${c.id}` === myCharId)?.name || myCharId;
                const specs  = [...(combat.spectators || [])];
                if (!specs.includes(myName)) {
                    specs.push(myName);
                    await supabaseClient.from('combats').update({ spectators: specs }).eq('id', combatId);
                }
            }

            /* 기존 채널 정리 후 새 채널 구독 */
            if (this.arenaChannel) {
                try { supabaseClient.removeChannel(this.arenaChannel); } catch(e) {}
                this.arenaChannel = null;
            }

            this.arenaChannel = supabaseClient.channel(`arena-${combatId}`)
                /* 전투 데이터 변경 감지 */
                .on('postgres_changes', {
                    event: 'UPDATE', schema: 'public', table: 'combats', filter: `id=eq.${combatId}`
                }, payload => {
                    this._latestCombat = payload.new;
                    this.updateArenaUI(payload.new);
                })
                /* 전투방 삭제(강제 종료) 감지 */
                .on('postgres_changes', {
                    event: 'DELETE', schema: 'public', table: 'combats', filter: `id=eq.${combatId}`
                }, () => {
                    alert('대련방이 종료되어 로비로 돌아갑니다.');
                    this.forceExitArena();
                })
                .subscribe();

            /* 전장 UI 표시 */
            const arena = document.getElementById('sparring-arena');
            if (arena) arena.style.display = 'flex';
            const soloStage = document.getElementById('solo-arena-stage');
            const teamStage = document.getElementById('team-arena-stage');
            if (soloStage) soloStage.style.display = '';
            if (teamStage) teamStage.style.display  = 'none';

            this._renderMyMoney();
            this.updateArenaUI(combat);
        },


        /* ─────────────────────────────────────────────────────────
           목인장 연습 모드
        ───────────────────────────────────────────────────────── */

        /**
         * DB 없이 로컬에서만 진행하는 연습 대련을 시작합니다.
         *
         * 매개변수:
         *   presetIdx : DUMMY_PRESETS 배열의 인덱스 (0=쉬움, 1=보통, 2=어려움)
         */
        startDummyPractice(presetIdx) {
            this._stopLobbyWatch();
            this.mode            = 'solo';
            this.isDummyPractice = true;
            this.currentCombatId = null;
            this.currentTeamId   = null;
            this.myRole          = 'p1';

            const myCharId = charOwners[currentUser.email];
            const myPhase  = window.combatRequestedPhases?.myPhase ?? window.globalMainPhase ?? 0;
            const myData   = this._buildCharData(myCharId, myPhase);

            /* 프리셋을 깊은 복사해서 사용 (원본 변경 방지) */
            const dummy    = JSON.parse(JSON.stringify(this.DUMMY_PRESETS[presetIdx]));
            dummy.id       = 'char-dummy';
            dummy.alive    = true;
            dummy.fled     = false;
            dummy.skipTurn = false;

            this._dummyCombat = {
                id:           'dummy',
                p1_id:        myCharId,
                p2_id:        'char-dummy',
                status:       'ongoing',
                combat_phase: 'initiative',
                attacker_id:  null,
                round:        1,
                p1_data:      myData,
                p2_data:      dummy,
                spectators:   [],
                bets:         { p1: [], p2: [] },
                log:          [`[ ${myData.name} VS ${dummy.name} ] 연습 대련 시작`],
            };

            const arena = document.getElementById('sparring-arena');
            if (arena) arena.style.display = 'flex';
            const soloStage = document.getElementById('solo-arena-stage');
            const teamStage = document.getElementById('team-arena-stage');
            if (soloStage) soloStage.style.display = '';
            if (teamStage) teamStage.style.display  = 'none';

            this._renderMyMoney();
            this.updateArenaUI(this._dummyCombat);
        },

        /* 목인장 AI 행동 실행 */
        async executeDummyAI(data) {
            if (!this.isDummyPractice) return;
            await new Promise(r => setTimeout(r, 900)); /* 0.9초 딜레이 (자연스러움) */

            const phase = data.combat_phase;
            if (phase === 'initiative')                                         await this.rollInitiative();
            else if (phase === 'attack'  && data.attacker_id === 'char-dummy') await this._dummyRollAttack();
            else if (phase === 'defense' && data.attacker_id !== 'char-dummy') await this._dummyRollDefense(Math.random() > 0.5 ? 'dodge' : 'counter');
        },

        /* 목인장 AI 공격 */
        async _dummyRollAttack() {
            const data   = this._dummyCombat;
            const dummy  = data.p2_data;
            const w      = dummy.weapons[0] || { name: '나무 주먹', dmg: '1d3', type: 'brawl' };
            const weapon = { name: w.name, dmg: w.dmg, type: w.type, skill: dummy.skills[w.type] || dummy.skills.brawl };
            const result = this._roll(weapon.skill);
            const logs   = [...data.log];

            logs.push(`[공격] <b>${dummy.name}</b> [${weapon.name}] 🎲${result.roll} → <span style="color:${result.color}">${result.label}</span>`);

            let updates;
            if (result.grade === 4) {
                /* 결정적 성공: 방어 불가 */
                logs.push(`<span style="color:#fff;font-weight:bold;">결정적 성공! 방어 불가!</span>`);
                updates = await this._applyDamage(data, 'char-dummy', weapon, result, logs, true, false);
            } else if (result.grade <= 0) {
                /* 실패/대실패 */
                logs.push(result.grade === 0 ? '빗나감.' : '대실패…');
                updates = this._nextTurn(data, logs);
            } else {
                /* 성공: 플레이어 방어 선택 대기 */
                logs.push(`[${data.p1_data.name}의 차례] 회피 또는 반격을 선택하세요.`);
                updates = {
                    combat_phase:  'defense',
                    chosen_weapon: weapon,
                    attack_roll:   { roll: result.roll, grade: result.grade, gradeLabel: result.label, gradeColor: result.color },
                };
            }
            await this._updateCombat({ ...updates, log: logs });
        },

        /* 목인장 AI 방어 */
        async _dummyRollDefense(type) {
            const data    = this._dummyCombat;
            const dummy   = data.p2_data;
            const attWeap = data.chosen_weapon || { name: '맨손', dmg: '1d3', type: 'brawl' };
            const attRoll = data.attack_roll   || { grade: 1 };
            const skill   = type === 'dodge'
                ? dummy.skills.dodge
                : (dummy.skills[attWeap.type] || dummy.skills.brawl);
            const label  = type === 'dodge' ? '회피' : '반격';
            const result = this._roll(skill);
            const logs   = [...data.log];

            logs.push(`[${label}] <b>${dummy.name}</b> 🎲${result.roll} → <span style="color:${result.color}">${result.label}</span>`);

            const attGrade = attRoll.grade || 0;
            const defGrade = result.grade;
            let   updates  = {};

            if (type === 'dodge') {
                if (defGrade > 0 && defGrade >= attGrade) {
                    logs.push('회피 성공!');
                    Object.assign(updates, this._nextTurn(data, logs));
                } else {
                    logs.push('회피 실패!');
                    Object.assign(updates, await this._applyDamage(data, data.attacker_id, attWeap, attRoll, logs, attGrade >= 3, false));
                }
            } else {
                /* 반격: 방어 등급이 더 높으면 공격 역전 */
                if (defGrade > attGrade) {
                    logs.push('반격 성공!');
                    Object.assign(updates, await this._applyDamage(data, 'char-dummy', { name: '반격', dmg: '1d3', type: 'brawl' }, result, logs, defGrade >= 3, false));
                } else if (defGrade === attGrade && defGrade > 0) {
                    logs.push('동률! 서로 피해를 입습니다!');
                    const res1 = await this._applyDamage(data, data.attacker_id, attWeap, attRoll, logs, attGrade >= 3, false);
                    const res2 = await this._applyDamage({ ...data, ...res1 }, 'char-dummy', { name: '반격', dmg: '1d3', type: 'brawl' }, result, logs, defGrade >= 3, false);
                    Object.assign(updates, res2);
                } else {
                    logs.push('반격 실패!');
                    Object.assign(updates, await this._applyDamage(data, data.attacker_id, attWeap, attRoll, logs, attGrade >= 3, false));
                }
            }

            await this._updateCombat({ ...updates, log: logs });
        },


        /* ─────────────────────────────────────────────────────────
           UI 업데이트
        ───────────────────────────────────────────────────────── */

        /**
         * 전투 데이터를 받아 화면(HP 바, 로그, 조작 패널 등)을 갱신합니다.
         * Realtime 이벤트를 받을 때마다 자동으로 호출됩니다.
         */
        updateArenaUI(data) {
            if (!data) return;
            if (this.mode === 'team') { this.updateTeamArenaUI(data); return; }

            const p1 = data.p1_data || {};
            const p2 = data.p2_data || {};

            /* HP/MP/법력 바와 수치 업데이트 */
            const _s = (id, prop, val) => {
                const el = document.getElementById(id);
                if (el) { el[prop] = val; el.style.display = ''; }
            };

            _s('cb-p1-name',   'innerText', p1.name || 'P1');
            _s('cb-p2-name',   'innerText', p2.name || 'P2');
            _s('cb-p1-img',    'src',       p1.img   || PLACEHOLDER_100);
            _s('cb-p2-img',    'src',       p2.img   || PLACEHOLDER_100);
            _s('cb-p1-hp-txt', 'innerText', `HP ${Math.max(0, p1.hp ?? p1.maxHp)} / ${p1.maxHp}`);
            _s('cb-p2-hp-txt', 'innerText', `HP ${Math.max(0, p2.hp ?? p2.maxHp)} / ${p2.maxHp}`);

            const setBar = (id, cur, max) => {
                const el = document.getElementById(id);
                if (el) el.style.width = `${Math.max(0, ((cur ?? max) / max) * 100)}%`;
            };
            setBar('cb-p1-hp', p1.hp, p1.maxHp);
            setBar('cb-p2-hp', p2.hp, p2.maxHp);
            setBar('cb-p1-mp', p1.mp, p1.maxMp);
            setBar('cb-p2-mp', p2.mp, p2.maxMp);
            setBar('cb-p1-bp', p1.bp, p1.maxBp);
            setBar('cb-p2-bp', p2.bp, p2.maxBp);

            /* 전투 로그 */
            const logBox = document.getElementById('combat-log');
            if (logBox && data.log) {
                logBox.innerHTML = data.log.map(l => `<div>${l}</div>`).join('');
                logBox.scrollTop = logBox.scrollHeight;
            }

            /* 관전자 목록 */
            const specs  = data.spectators || [];
            const scEl   = document.getElementById('spectator-count');
            const slEl   = document.getElementById('spectator-list');
            if (scEl) scEl.innerText  = specs.length;
            if (slEl) slEl.innerHTML  = specs.map(n => `<span class="spectator-tag">[관전] ${n}</span>`).join('');

            /* 목인장 AI 턴 처리 */
            if (this.isDummyPractice && data.status === 'ongoing') {
                const isDummyTurn =
                    (data.combat_phase === 'attack'    && data.attacker_id === 'char-dummy') ||
                    (data.combat_phase === 'defense'   && data.attacker_id !== 'char-dummy') ||
                    (data.combat_phase === 'initiative');
                if (isDummyTurn) setTimeout(() => this.executeDummyAI(data), 1000);
            }

            /* 조작 패널 업데이트 */
            this._renderActionPanel(data);
        },

        /**
         * 내 턴 상황에 따라 적절한 조작 버튼을 표시합니다.
         * (이니셔티브 / 공격 / 방어 / 관전 / 종료)
         */
        _renderActionPanel(data) {
            const box        = document.getElementById('combat-actions');
            if (!box) return;

            const phase      = data.combat_phase;
            const attackerId = data.attacker_id;
            const myCharId   = currentUser ? charOwners[currentUser.email] : null;
            const p1         = data.p1_data || {};
            const p2         = data.p2_data || {};
            const myData     = (this.myRole === 'p1') ? p1 : p2;
            const isAttacker = (attackerId === myCharId);
            const isPlayer   = (this.myRole === 'p1' || this.myRole === 'p2');
            const isDefender = isPlayer && !isAttacker && attackerId !== null;

            /* 관전자 */
            if (this.myRole === 'spectator') {
                box.innerHTML = `<div style="text-align:center; color:#555; width:100%;">
                    관전 중...<br><br>
                    <button class="combat-btn combat-btn-surrender" style="width:100%;" onclick="CombatSys.forceExitArena()">관전 종료</button>
                </div>`;
                return;
            }

            /* 종료 */
            if (data.status === 'finished' || phase === 'finished') {
                box.innerHTML = `<div style="color:#aaa; text-align:center; width:100%; padding:8px;">
                    승패가 결정되었습니다!<br><br>
                    <button class="combat-btn combat-btn-dodge" style="width:100%;" onclick="CombatSys.forceExitArena()">나가기</button>
                </div>`;
                return;
            }

            /* 이니셔티브(선공 판정) */
            if (phase === 'initiative') {
                if (!attackerId && this.myRole === 'p1') {
                    box.innerHTML = `<div style="width:100%;">
                        <div style="color:#aaa; text-align:center; margin-bottom:14px;">DEX 대항 판정으로 선공을 결정합니다.</div>
                        <button class="combat-btn combat-btn-attack" style="width:100%; padding:14px;" onclick="CombatSys.rollInitiative()">주사위 굴리기</button>
                    </div>`;
                } else {
                    box.innerHTML = `<div style="text-align:center; color:#555; width:100%;">선공 판정 대기 중...</div>`;
                }
                return;
            }

            /* 공격 패널 */
            if (phase === 'attack' && isAttacker) {
                const sk = myData.skills || { brawl: 25 };
                let wOpts = `<option value="__unarmed__">[격투] 맨손 (1d3 / ${sk.brawl}%)</option>`;
                (myData.weapons || []).forEach((w, i) => {
                    const wSkill   = sk[w.type] || sk.brawl;
                    const typeName = { sword: '도검', bow: '활', throw: '투척', magic: '도술' }[w.type] || '격투';
                    wOpts += `<option value="${i}">[${typeName}] ${w.name} (${w.dmg} / ${wSkill}%)</option>`;
                });

                box.innerHTML = `<div style="display:flex; gap:12px; width:100%;">
                    <div style="flex:1; display:flex; flex-direction:column; gap:8px;">
                        <select id="attack-weapon-sel" class="combat-select" style="width:100%;">${wOpts}</select>
                        <label style="display:flex; align-items:center; gap:6px; font-size:0.82rem; color:#888; cursor:pointer;">
                            <input type="checkbox" id="attack-bp-boost" style="cursor:pointer;">
                            법력 5 소비 → 데미지 2배
                        </label>
                    </div>
                    <div style="flex:1; display:flex; flex-direction:column; gap:6px;">
                        <button class="combat-btn combat-btn-attack" style="width:100%; padding:12px;" onclick="CombatSys.rollAttack()">공격 판정</button>
                        <div style="display:flex; gap:6px;">
                            <button class="combat-btn combat-btn-dodge"     style="flex:1;" onclick="CombatSys.soloFlee()">도주</button>
                            <button class="combat-btn combat-btn-surrender" style="flex:1;" onclick="CombatSys.surrender()">항복</button>
                        </div>
                    </div>
                </div>`;
                return;
            } else if (phase === 'attack' && !isAttacker) {
                const attName = (attackerId === data.p1_id) ? p1.name : p2.name;
                box.innerHTML = `<div style="text-align:center; color:#555; width:100%;"><b>${attName}</b>의 공격 대기 중...</div>`;
                return;
            }

            /* 방어 패널 */
            if (phase === 'defense' && isDefender) {
                const ar         = data.attack_roll || {};
                const attGrade   = ar.grade ?? 0;
                const canDodge   = attGrade < 3; /* 극단적 성공이면 일반 회피 불가 */
                const attName    = (attackerId === data.p1_id) ? p1.name : p2.name;
                const sk         = myData.skills || { brawl: 25, dodge: 30, drive: 20 };
                const counterSkill = sk[data.chosen_weapon?.type] || sk.brawl;

                box.innerHTML = `<div style="background:rgba(255,255,255,0.02); border:1px solid #333; border-radius:8px; padding:14px; width:100%;">
                    <div style="text-align:center; margin-bottom:14px;">
                        <div style="color:#888; font-size:0.88rem; margin-bottom:4px;"><b>${attName}</b>의 [${data.chosen_weapon?.name || '맨손'}] 공격!</div>
                        <div style="color:${ar.gradeColor || '#aaa'}; font-weight:bold; font-size:1.2rem;">${ar.gradeLabel || ''} (${ar.roll})</div>
                        ${!canDodge ? `<div style="color:#ff6666; font-size:0.82rem; margin-top:5px;">극단적 성공 — 일반 회피 불가</div>` : ''}
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px;">
                        ${canDodge
                            ? `<button class="combat-btn combat-btn-defend" style="padding:10px;" onclick="CombatSys.rollDefense('dodge')">회피<br><span style="font-size:0.78rem; font-weight:normal;">(${sk.dodge}%)</span></button>`
                            : `<div style="padding:10px; background:rgba(255,0,0,0.06); border:1px solid #333; border-radius:4px; color:#555; text-align:center; font-size:0.82rem;">회피 불가</div>`
                        }
                        <button class="combat-btn combat-btn-dodge" style="padding:10px;" onclick="CombatSys.rollDefense('counter')">반격<br><span style="font-size:0.78rem; font-weight:normal;">(${counterSkill}%)</span></button>
                    </div>
                    <button class="combat-btn combat-btn-defend" style="width:100%; background:#222; border-color:#555;" onclick="CombatSys.rollDefense('magic_dodge')">자동차 운전 (긴급 회피)<br><span style="font-size:0.78rem; font-weight:normal;">[법력 5 소모] (${sk.drive}%)</span></button>
                </div>`;
            } else if (phase === 'defense' && isAttacker) {
                const defName = (attackerId === data.p1_id) ? p2.name : p1.name;
                box.innerHTML = `<div style="text-align:center; color:#555; width:100%;"><b>${defName}</b>의 방어 선택 대기 중...</div>`;
            }
        },


        /* ─────────────────────────────────────────────────────────
           전투 판정 실행 함수들
        ───────────────────────────────────────────────────────── */

        /* 선공 판정: 양쪽의 DEX로 1d100을 굴려 높은 쪽이 선공 */
        async rollInitiative() {
            const combat = this._getCombat();
            if (!combat) return;
            const p1 = combat.p1_data, p2 = combat.p2_data;
            const r1 = this._roll(p1.dex), r2 = this._roll(p2.dex);
            const logs = [...(combat.log || [])];

            logs.push(`[ Round ${combat.round} ]`);
            logs.push(`[선공] <b>${p1.name}</b> DEX(${p1.dex}) 🎲${r1.roll} → <span style="color:${r1.color}">${r1.label}</span>`);
            logs.push(`[선공] <b>${p2.name}</b> DEX(${p2.dex}) 🎲${r2.roll} → <span style="color:${r2.color}">${r2.label}</span>`);

            /* 등급이 같으면 DEX가 높은 쪽이 선공 */
            let attackerId = r1.grade !== r2.grade
                ? (r1.grade > r2.grade ? combat.p1_id : combat.p2_id)
                : (p1.dex >= p2.dex ? combat.p1_id : combat.p2_id);

            logs.push(`<b style="color:#ddd">${attackerId === combat.p1_id ? p1.name : p2.name}</b> 선공!`);
            await this._updateCombat({ combat_phase: 'attack', attacker_id: attackerId, log: logs });
        },

        /* 공격 판정 */
        async rollAttack() {
            const combat  = this._getCombat();
            if (!combat) return;
            const isP1    = (this.myRole === 'p1');
            const myData  = { ...(isP1 ? combat.p1_data : combat.p2_data) };
            const sk      = myData.skills || { brawl: 25 };

            /* 선택된 무기 확인 */
            const weaponIdx = document.getElementById('attack-weapon-sel')?.value;
            const isBoost   = document.getElementById('attack-bp-boost')?.checked;
            let weapon;
            if (!weaponIdx || weaponIdx === '__unarmed__') {
                weapon = { name: '맨손', dmg: '1d3', type: 'brawl', skill: sk.brawl };
            } else {
                const w = myData.weapons[parseInt(weaponIdx)];
                weapon  = { name: w.name, dmg: w.dmg, type: w.type, skill: sk[w.type] || sk.brawl };
            }

            /* 법력 소비 확인 */
            if (isBoost) {
                if ((myData.bp ?? 0) < 5) { alert('법력이 부족합니다!'); return; }
                myData.bp -= 5;
            }

            const result     = this._roll(weapon.skill);
            const logs       = [...(combat.log || [])];
            const myDataKey  = isP1 ? 'p1_data' : 'p2_data';
            let   updates    = { [myDataKey]: myData };

            logs.push(`[공격] <b>${myData.name}</b> [${weapon.name}]${isBoost ? ' (법력 증폭)' : ''} 🎲${result.roll} → <span style="color:${result.color}">${result.label}</span>`);

            if (result.grade === 4) {
                /* 결정적 성공: 즉시 최대 피해 적용 */
                logs.push(`<span style="color:#fff;font-weight:bold;">결정적 성공! 방어 불가!</span>`);
                Object.assign(updates, await this._applyDamage({ ...combat, [myDataKey]: myData }, charOwners[currentUser.email], weapon, result, logs, true, isBoost));
            } else if (result.grade <= 0) {
                logs.push(result.grade === 0 ? '빗나감.' : '대실패…');
                Object.assign(updates, this._nextTurn(combat, logs));
            } else {
                /* 성공: 상대방 방어 단계로 */
                Object.assign(updates, {
                    combat_phase:  'defense',
                    chosen_weapon: { ...weapon, isBoost },
                    attack_roll:   { roll: result.roll, grade: result.grade, gradeLabel: result.label, gradeColor: result.color },
                });
            }
            await this._updateCombat({ ...updates, log: logs });
        },

        /* 방어 판정 */
        async rollDefense(type) {
            const combat   = this._getCombat();
            if (!combat) return;
            const isP1     = (this.myRole === 'p1');
            const myData   = { ...(isP1 ? combat.p1_data : combat.p2_data) };
            const attWeapon = combat.chosen_weapon || { name: '맨손', dmg: '1d3', type: 'brawl' };
            const attRoll   = combat.attack_roll   || { grade: 1 };
            const sk        = myData.skills || { brawl: 25, dodge: 30, drive: 20 };

            let skillVal = sk.dodge, label = '회피';
            if (type === 'counter')     { skillVal = sk[attWeapon.type] || sk.brawl; label = '반격'; }
            if (type === 'magic_dodge') {
                if ((myData.bp ?? 0) < 5) { alert('법력이 부족합니다!'); return; }
                myData.bp -= 5; skillVal = sk.drive; label = '자동차 운전(긴급 회피)';
            }

            const result   = this._roll(skillVal);
            const logs     = [...(combat.log || [])];
            logs.push(`[${label}] <b>${myData.name}</b> 🎲${result.roll} → <span style="color:${result.color}">${result.label}</span>`);

            const attGrade  = attRoll.grade || 0;
            const defGrade  = result.grade;
            const myDataKey = isP1 ? 'p1_data' : 'p2_data';
            let   updates   = { [myDataKey]: myData };
            const baseState = { ...combat, [myDataKey]: myData };

            if (type === 'dodge' || type === 'magic_dodge') {
                if (defGrade > 0 && defGrade >= attGrade) {
                    logs.push('회피 성공!');
                    Object.assign(updates, this._nextTurn(baseState, logs));
                } else {
                    logs.push('회피 실패!');
                    Object.assign(updates, await this._applyDamage(baseState, combat.attacker_id, attWeapon, attRoll, logs, attGrade >= 3, attWeapon.isBoost));
                }
            } else {
                /* 반격 */
                if (defGrade > attGrade) {
                    logs.push('반격 성공!');
                    Object.assign(updates, await this._applyDamage(baseState, charOwners[currentUser.email], { name: '반격', dmg: '1d3', type: 'brawl', skill: sk.brawl }, result, logs, defGrade >= 3, false));
                } else if (defGrade === attGrade && defGrade > 0) {
                    logs.push('동률! 서로 피해!');
                    const res1 = await this._applyDamage(baseState, combat.attacker_id, attWeapon, attRoll, logs, attGrade >= 3, attWeapon.isBoost);
                    const res2 = await this._applyDamage({ ...baseState, ...res1 }, charOwners[currentUser.email], { name: '반격', dmg: '1d3', type: 'brawl', skill: sk.brawl }, result, logs, defGrade >= 3, false);
                    Object.assign(updates, res2);
                } else {
                    logs.push('반격 실패!');
                    Object.assign(updates, await this._applyDamage(baseState, combat.attacker_id, attWeapon, attRoll, logs, attGrade >= 3, attWeapon.isBoost));
                }
            }
            await this._updateCombat({ ...updates, log: logs });
        },

        /**
         * 피해를 적용합니다.
         * 피해 보너스(DB)를 계산하고 HP를 차감합니다.
         * HP가 0 이하면 사망 처리하고 전투를 종료합니다.
         */
        async _applyDamage(combat, attackerCharId, weapon, attackRoll, logs, isCritical, isBoost) {
            const isP1att = (combat.p1_id === attackerCharId);
            const attData = { ...(isP1att ? combat.p1_data : combat.p2_data) };
            const defData = { ...(isP1att ? combat.p2_data : combat.p1_data) };

            /* 무기 기본 피해 */
            let weapDmg = this._rollDmg(weapon.dmg, isCritical);
            if (isBoost) weapDmg *= 2; /* 법력 증폭: 2배 */

            /* 피해 보너스(Damage Bonus) 계산 */
            const db = attData.db || { dice: 0, mod: 0 };
            let dbVal = db.mod;
            if (db.dice > 0) {
                dbVal += isCritical
                    ? db.dice               /* 결정적 성공: 최대값 */
                    : Math.floor(Math.random() * db.dice) + 1;
            }

            const totalDmg = Math.max(0, weapDmg + dbVal);
            logs.push(`[ 피해 ] <b>${attData.name}</b> → <b style="color:#ffcccc">총 ${totalDmg} 피해</b>`);

            defData.hp = (defData.hp ?? defData.maxHp) - totalDmg;
            let newStatus = combat.status;

            if (defData.hp <= 0) {
                defData.hp    = 0;
                defData.alive = false;
                logs.push(`<b>${defData.name}</b> 전투 불능!`);
                newStatus = 'finished';
            } else {
                logs.push(`<b>${defData.name}</b> HP: ${defData.hp}/${defData.maxHp}`);
            }

            const updates = {
                p1_data:       isP1att ? attData : defData,
                p2_data:       isP1att ? defData : attData,
                status:        newStatus,
                chosen_weapon: null,
                attack_roll:   null,
            };

            if (newStatus === 'finished') {
                updates.combat_phase = 'finished';
            } else {
                Object.assign(updates, this._nextTurn(combat, logs));
            }

            return updates;
        },

        /**
         * 현재 공격자에서 다음 공격자로 턴을 넘깁니다.
         */
        _nextTurn(combat, logs) {
            const nextAtt   = (combat.attacker_id === combat.p1_id) ? combat.p2_id : combat.p1_id;
            const nextRound = (nextAtt === combat.p1_id) ? combat.round + 1 : combat.round;
            if (nextAtt === combat.p1_id) logs.push(`[ Round ${nextRound} ]`);
            const pData = (nextAtt === combat.p1_id) ? combat.p1_data : combat.p2_data;
            logs.push(`[${pData.name}의 차례] 공격하세요.`);
            return { combat_phase: 'attack', attacker_id: nextAtt, chosen_weapon: null, attack_roll: null, round: nextRound };
        },


        /* ─────────────────────────────────────────────────────────
           단체전 (간략 구현)
        ───────────────────────────────────────────────────────── */

        /* 단체전 로비 렌더링 */
        _renderTeamLobby() {
            const lb = document.getElementById('team-lobby-area');
            if (!lb) return;
            this._teamBuilderA = [];
            this._teamBuilderB = [];

            lb.innerHTML = `
            <div class="challenge-box-modern">
                <div class="challenge-box-title">새로운 단체전 구성</div>
                <div class="team-builder-grid">
                    <div class="team-col team-col-a">
                        <div style="font-size:1rem; color:#aaa; font-weight:bold; margin-bottom:12px;">Team A</div>
                        <div id="team-a-slots" class="team-slot-list"></div>
                        <button class="team-add-btn" onclick="CombatSys._addToTeam('a')">+ 추가하기</button>
                    </div>
                    <div class="team-col-divider">VS</div>
                    <div class="team-col" style="padding:18px;">
                        <div style="font-size:1rem; color:#aaa; font-weight:bold; margin-bottom:12px;">Team B</div>
                        <div id="team-b-slots" class="team-slot-list"></div>
                        <button class="team-add-btn" onclick="CombatSys._addToTeam('b')">+ 추가하기</button>
                    </div>
                </div>
                <button class="team-start-btn" onclick="CombatSys.createTeamBattle()">⚔ 단체전 시작</button>
            </div>
            <div style="margin-top:24px;">
                <div style="font-size:0.85rem; color:#555; letter-spacing:2px; margin-bottom:12px;">진행 중인 단체전</div>
                <div id="team-ongoing-list"></div>
            </div>`;

            this._renderTeamSlots();
            this._loadTeamOngoing();
        },

        /* 팀원 추가 팝업 */
        _addToTeam(side) {
            const used      = [...this._teamBuilderA, ...this._teamBuilderB];
            const available = charData.filter(c => !used.includes(`char-${c.id}`));
            if (!available.length) { alert('추가할 캐릭터가 없습니다.'); return; }

            const modal = document.createElement('div');
            modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:99999;display:flex;align-items:center;justify-content:center;';
            modal.innerHTML = `
                <div style="background:#1a1a1a;border:1px solid #444;border-radius:10px;padding:28px;min-width:280px;">
                    <h4 style="color:#aaa;margin:0 0 16px;">캐릭터 선택</h4>
                    <select id="team-pick-sel" style="width:100%;padding:10px;background:#111;border:1px solid #333;color:#ddd;margin-bottom:16px;">
                        ${available.map(c => `<option value="char-${c.id}">${c.name}</option>`).join('')}
                    </select>
                    <div style="display:flex;gap:10px;">
                        <button onclick="CombatSys._confirmAddToTeam('${side}')" style="flex:1;padding:10px;background:#333;color:#ddd;border:none;border-radius:6px;cursor:pointer;">추가</button>
                        <button onclick="this.closest('[style*=fixed]').remove()" style="flex:1;padding:10px;background:#1a1a1a;color:#666;border:1px solid #333;border-radius:6px;cursor:pointer;">취소</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
        },

        _confirmAddToTeam(side) {
            const sel = document.getElementById('team-pick-sel');
            if (!sel?.value) return;
            if (side === 'a') this._teamBuilderA.push(sel.value);
            else              this._teamBuilderB.push(sel.value);
            document.querySelector('[style*="position:fixed"][style*="inset:0"]')?.remove();
            this._renderTeamSlots();
        },

        _removeFromTeam(side, idx) {
            if (side === 'a') this._teamBuilderA.splice(idx, 1);
            else              this._teamBuilderB.splice(idx, 1);
            this._renderTeamSlots();
        },

        /* 팀원 슬롯 렌더링 */
        _renderTeamSlots() {
            const nm     = {};
            charData.forEach(c => { nm[`char-${c.id}`] = c.name; });
            const phase  = window.globalMainPhase || 0;
            const getImg = id => {
                const p = allProfiles.find(x => x.char_id === id && x.phase === phase);
                const b = charData.find(c => `char-${c.id}` === id);
                return p?.combat_img || p?.profile_image || b?.img || PLACEHOLDER_100;
            };
            const render = (ids, side) => ids.length
                ? ids.map((id, i) =>
                    `<div style="display:flex;align-items:center;background:rgba(255,255,255,0.03);padding:8px;border-radius:6px;margin-bottom:6px;border:1px solid #222;">
                        <img src="${getImg(id)}" style="width:28px;height:28px;border-radius:4px;object-fit:cover;margin-right:8px;">
                        <span style="flex:1;color:#bbb;font-size:0.88rem;">${nm[id] || id}</span>
                        <button style="background:none;border:none;color:#555;cursor:pointer;" onclick="CombatSys._removeFromTeam('${side}',${i})">✕</button>
                    </div>`).join('')
                : `<div style="text-align:center;color:#444;font-size:0.82rem;padding:14px 0;">멤버 없음</div>`;

            const sA = document.getElementById('team-a-slots');
            const sB = document.getElementById('team-b-slots');
            if (sA) sA.innerHTML = render(this._teamBuilderA, 'a');
            if (sB) sB.innerHTML = render(this._teamBuilderB, 'b');
        },

        async _loadTeamOngoing() {
            const ol = document.getElementById('team-ongoing-list');
            if (!ol || !supabaseClient) return;
            const { data } = await supabaseClient.from('team_combats').select('id,team_a,team_b,status').eq('status','ongoing').order('created_at',{ascending:false});
            const nm = {}; charData.forEach(c => { nm[`char-${c.id}`] = c.name; });
            if (!data?.length) { ol.innerHTML = `<div class="modern-empty-card">진행 중인 단체전이 없습니다.</div>`; return; }
            ol.innerHTML = data.map(tc => {
                const aN = (tc.team_a||[]).map(m => nm[m.id]||m.id).join(', ');
                const bN = (tc.team_b||[]).map(m => nm[m.id]||m.id).join(', ');
                return `<div class="modern-card" style="flex-direction:column;gap:10px;">
                    <span class="modern-badge badge-live">TEAM MATCH</span>
                    <div><span style="color:#aaa;">A:</span> ${aN}</div>
                    <div><span style="color:#777;">B:</span> ${bN}</div>
                    <button class="modern-action-btn btn-solid-spectate" style="width:100%;" onclick="CombatSys.joinTeamArena('${tc.id}')">관전하기</button>
                </div>`;
            }).join('');
        },

        async createTeamBattle() {
            if (!currentUser) { alert('로그인이 필요합니다.'); return; }
            if (!this._teamBuilderA.length || !this._teamBuilderB.length) { alert('양팀에 각 1명 이상 추가하세요.'); return; }
            const phase  = window.globalMainPhase || 0;
            const teamA  = this._teamBuilderA.map(id => { const d = this._buildCharData(id, phase); d.team = 'a'; return d; });
            const teamB  = this._teamBuilderB.map(id => { const d = this._buildCharData(id, phase); d.team = 'b'; return d; });
            const { data, error } = await supabaseClient.from('team_combats').insert([{
                status: 'ongoing', combat_phase: 'initiative',
                team_a: teamA, team_b: teamB,
                turn_order: [], current_turn_idx: 0,
                attacker_id: null, target_id: null,
                log: [`[ 단체전 시작 ] Team A: ${teamA.map(m=>m.name).join(', ')} / Team B: ${teamB.map(m=>m.name).join(', ')}`],
            }]).select().single();
            if (error) { console.error(error); alert('단체전 생성 실패'); return; }
            await this.joinTeamArena(data.id, true);
        },

        async joinTeamArena(teamCombatId) {
            alert('단체전 입장 기능은 index.html에서 Sparring 섹션 설정 후 사용 가능합니다.');
        },

        /* 단체전 UI 업데이트 (간략) */
        updateTeamArenaUI(tc) {
            const logBox = document.getElementById('combat-log');
            if (logBox && tc.log) { logBox.innerHTML = tc.log.map(l => `<div>${l}</div>`).join(''); logBox.scrollTop = logBox.scrollHeight; }
        },


        /* ─────────────────────────────────────────────────────────
           도주 / 항복 / 퇴장
        ───────────────────────────────────────────────────────── */

        async soloFlee() {
            const combat = this._getCombat();
            if (!combat || !confirm('도주하시겠습니까?')) return;
            const md = (this.myRole === 'p1') ? combat.p1_data : combat.p2_data;
            const r  = this._roll(md.dex * 2);
            const l  = [...(combat.log || [])];
            l.push(`[도주] <b>${md.name}</b> 🎲${r.roll}`);
            if (r.grade > 0) { l.push('도주 성공!'); await this._updateCombat({ status: 'finished', combat_phase: 'finished', log: l }); }
            else              { l.push('도주 실패!'); await this._updateCombat({ ...this._nextTurn(combat, l), log: l }); }
        },

        async surrender() {
            const c = this._getCombat();
            if (!c || !confirm('항복하시겠습니까?')) return;
            const i = (this.myRole === 'p1');
            const m = i ? { ...c.p1_data } : { ...c.p2_data };
            m.hp = 0;
            const l = [...(c.log || [])];
            l.push(`[ 항복 ] <b>${m.name}</b>`);
            await this._updateCombat({ p1_data: i ? m : c.p1_data, p2_data: i ? c.p2_data : m, status: 'finished', combat_phase: 'finished', log: l });
        },

        async exitArena() {
            if (this.myRole !== 'spectator' && !this.isDummyPractice) {
                if (confirm('방을 종료하시겠습니까? (모든 참가자가 로비로 돌아갑니다)')) {
                    const table = this.mode === 'team' ? 'team_combats' : 'combats';
                    const id    = this.mode === 'team' ? this.currentTeamId : this.currentCombatId;
                    await supabaseClient.from(table).delete().eq('id', id);
                }
            }
            this.forceExitArena();
        },

        /* 전장 즉시 나가기 (채널 정리 + UI 리셋) */
        forceExitArena() {
            if (this.arenaChannel) {
                try { supabaseClient.removeChannel(this.arenaChannel); } catch(e) {}
            }
            this.currentCombatId = null;
            this.currentTeamId   = null;
            this.myRole          = 'spectator';
            this.myTeam          = null;
            this.isDummyPractice = false;

            const arena = document.getElementById('sparring-arena');
            if (arena) arena.style.display = 'none';

            if (this.mode === 'team') this._renderTeamLobby();
            else                      this.loadLobby();
            this._startLobbyWatch();
        },


        /* ─────────────────────────────────────────────────────────
           베팅 시스템
        ───────────────────────────────────────────────────────── */

        async bet(side) {
            if (!currentUser) { alert('로그인이 필요합니다.'); return; }
            if (this.isDummyPractice) { alert('연습 대련에서는 베팅할 수 없습니다.'); return; }

            const myCharId = charOwners[currentUser.email];
            const myName   = charData.find(c => `char-${c.id}` === myCharId)?.name || '익명';
            const amount   = parseInt(document.getElementById(`bet-amt-${side}`)?.value || '0');
            if (!amount || amount <= 0) { alert('베팅 금액을 입력하세요.'); return; }

            const combat  = this._latestCombat;
            if (!combat)  { alert('전투 정보가 없습니다.'); return; }
            const bets    = combat.bets || { p1: [], p2: [] };
            const already = [...(bets.p1 || []), ...(bets.p2 || [])].find(b => b.charId === myCharId);
            if (already)  { alert('이미 베팅하셨습니다.'); return; }

            /* 소지금 확인 */
            const { data: profile } = await supabaseClient.from('character_profiles').select('money').eq('char_id', myCharId).eq('phase', 0).single();
            const myMoney = profile?.money ? parseInt(String(profile.money).replace(/,/g, ''), 10) : 0;
            if (myMoney < amount) { alert(`소지금 부족! (보유: ${myMoney.toLocaleString()} G)`); return; }

            /* 소지금 차감 */
            await supabaseClient.from('character_profiles').update({ money: myMoney - amount }).eq('char_id', myCharId).eq('phase', 0);

            /* 베팅 목록에 추가 */
            const newBets = { p1: [...(bets.p1 || [])], p2: [...(bets.p2 || [])] };
            newBets[side].push({ charId: myCharId, name: myName, amount });
            await supabaseClient.from('combats').update({ bets: newBets }).eq('id', this.currentCombatId);

            alert(`${side.toUpperCase()} 진영에 ${amount.toLocaleString()} G 베팅 완료!`);
            this._renderMyMoney();
        },

        /* 소지금 표시 업데이트 */
        async _renderMyMoney() {
            if (!currentUser || !supabaseClient) return;
            const myCharId = charOwners[currentUser.email];
            if (!myCharId) return;
            const { data } = await supabaseClient.from('character_profiles').select('money').eq('char_id', myCharId).eq('phase', 0).single();
            const money    = data?.money ? parseInt(String(data.money).replace(/,/g, ''), 10) : 0;
            const fmt      = money.toLocaleString() + ' G';
            const el1 = document.getElementById('bet-my-money-p1'); if (el1) el1.innerText = fmt;
            const el2 = document.getElementById('bet-my-money-p2'); if (el2) el2.innerText = fmt;
        },


        /* ─────────────────────────────────────────────────────────
           내부 유틸
        ───────────────────────────────────────────────────────── */

        /* 목인장 연습이면 로컬 데이터, 아니면 DB를 통해 업데이트 */
        _getCombat() {
            return this.isDummyPractice ? this._dummyCombat : this._latestCombat;
        },

        async _updateCombat(updates) {
            if (this.isDummyPractice) {
                Object.assign(this._dummyCombat, updates);
                this.updateArenaUI(this._dummyCombat);
                return;
            }
            if (!this.currentCombatId) return;
            await supabaseClient.from('combats').update(updates).eq('id', this.currentCombatId);
        },
    };

    /* 전역으로 노출 */
    window.CombatSys = CombatSys;

    /*
     * prepareAndChallenge: 챕터 선택 후 대련 신청
     * index.html의 '대련' 버튼에서 호출됩니다.
     */
    window.prepareAndChallenge = function () {
        const myPhase     = parseInt(document.getElementById('spar-my-phase')?.value     ?? window.globalMainPhase ?? 0);
        const targetPhase = parseInt(document.getElementById('spar-target-phase')?.value ?? window.globalMainPhase ?? 0);
        window.combatRequestedPhases = { myPhase, targetPhase };
        CombatSys.challenge();
    };

})();
