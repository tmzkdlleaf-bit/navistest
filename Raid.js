/* =====================================================
   raid.js — 사흉수 토벌 레이드 시스템
   배포용 스크립트 (v8 기반 재작성)

   [변경사항]
   - 이모지 전면 제거 (텍스트 기호로 대체)
   - 보스/파티원 데이터를 무관한 더미 데이터로 교체
     (가나다, 나다라, 다라마, 라마바)
   - 모든 색상 참조를 CSS 변수(--raid-*)로 일원화
   - 인원수별 난이도 스케일 유지
   - 실시간 채널(supabaseClient) 연동 구조 유지
     (실제 서비스에서는 supabaseClient, currentUser,
      charOwners, currentChar 를 주입해야 함)
===================================================== */

/* ─────────────────────────────────────────────────────────────
   [전역] 채널 핸들 및 호스트 플래그
───────────────────────────────────────────────────────────── */

/** Supabase Realtime 채널 핸들 */
window.raidChannel = null;

/**
 * 이 클라이언트가 방장(호스트)인지 여부.
 * - true  → 게임 로직 실행 + 상태 브로드캐스트
 * - false → 상태를 수신하여 UI만 갱신, 행동 시 호스트에 요청
 */
var _raidIsHost = false;

/* ─────────────────────────────────────────────────────────────
   [전역 상태] RaidState
   실시간 동기화의 단일 진실 소스(Single Source of Truth)
   호스트가 변경 → broadcast → 비호스트가 Object.assign으로 덮어씀
───────────────────────────────────────────────────────────── */
const RaidState = {
    boss:               null,   /* 보스 객체 (HP, 부위 목록 포함) */
    party:              [],     /* 파티원 배열 */
    joined:             [],     /* 로비에서 참여 확정된 캐릭터 ID 배열 */
    selectedBossId:     null,   /* 로비 보스 선택 ID */
    isActive:           false,  /* 전투 활성 여부 */
    turnQueue:          [],     /* 이번 라운드의 남은 턴 큐 */
    currentRound:       0,      /* 현재 라운드 번호 */
    currentPlayerTurn:  null,   /* 현재 행동 차례인 파티원 객체 */
    awaitingInput:      false,  /* 보스 방어 AI 계산 중 = 입력 잠금 */
    bossDmgMulti:       1.0,    /* 보스 공격력 배율 (인원수 스케일) */
    bossSpeedMulti:     1.0,    /* 보스 선공 속도 배율 */
};

/* ─────────────────────────────────────────────────────────────
   [UI 전용 상태] 동기화 불필요 — 각 클라이언트가 독립 유지
───────────────────────────────────────────────────────────── */
let _raidSelectedPartId    = null;  /* 선택된 공격 부위 ID */
let _raidSelectedWeaponIdx = 0;     /* 선택된 무기 인덱스 */
let _raidHealTarget        = null;  /* 치료 대상 파티원 ID */

/* ─────────────────────────────────────────────────────────────
   [CSS 자동 주입] raid.css 를 <head>에 동적으로 삽입
───────────────────────────────────────────────────────────── */
(function _injectRaidCSS() {
    if (document.getElementById('raidCSSLink')) return;
    const link = document.createElement('link');
    link.id   = 'raidCSSLink';
    link.rel  = 'stylesheet';
    link.href = 'raid.css';          /* 같은 경로에 raid.css 필요 */
    document.head.appendChild(link);
})();

/* 이전 버전 인라인 스타일 제거 (구 버전 호환) */
(function _removeOldStyles() {
    document.getElementById('raidGlobalStyles')?.remove();
})();

/* ─────────────────────────────────────────────────────────────
   [애니메이션 CSS 주입] position:fixed 플로팅 텍스트용 키프레임
───────────────────────────────────────────────────────────── */
(function _injectKeyframes() {
    if (document.getElementById('raidInlineStyles')) return;
    const s = document.createElement('style');
    s.id = 'raidInlineStyles';
    s.textContent = [
        '@keyframes raidFloat{0%{opacity:1;transform:translateY(0) scale(1)}20%{opacity:1;transform:translateY(-18px) scale(1.1)}100%{opacity:0;transform:translateY(-80px) scale(1.3)}}',
        '@keyframes raidShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}',
        '@keyframes raidFlashHit{0%,100%{box-shadow:inset 0 0 0 0 transparent}35%{box-shadow:inset 0 0 32px 8px rgba(255,220,220,0.12)}}',
        '@keyframes raidFlashHeal{0%,100%{box-shadow:inset 0 0 0 0 transparent}35%{box-shadow:inset 0 0 28px 6px rgba(220,255,230,0.10)}}',
        '@keyframes raidDotBlink{0%,100%{opacity:.2}50%{opacity:1}}',
        '@keyframes raidFadeIn{from{opacity:0}to{opacity:1}}',
        '.raid-shake{animation:raidShake .42s ease}',
        '.raid-flash-hit{animation:raidFlashHit .55s ease}',
        '.raid-flash-heal{animation:raidFlashHeal .55s ease}',
    ].join('');
    document.head.appendChild(s);
})();

/* ─────────────────────────────────────────────────────────────
   [유틸] 공용 함수
───────────────────────────────────────────────────────────── */

/**
 * 현재 로그인 사용자의 캐릭터 ID를 반환.
 * 조회 순서: charOwners[email] → charOwners[uid] → currentChar.id → null
 */
function _getMyCharId() {
    try {
        const user   = (typeof currentUser   !== 'undefined') ? currentUser   : null;
        const owners = (typeof charOwners    !== 'undefined') ? charOwners    : null;
        if (user && owners) {
            if (user.email && owners[user.email]) return owners[user.email];
            if (user.id    && owners[user.id])    return owners[user.id];
        }
        if (typeof currentChar !== 'undefined' && currentChar?.id) return currentChar.id;
    } catch (e) { console.warn('[Raid] _getMyCharId 오류:', e); }
    return null;
}

/** 디버그: 콘솔에서 window._raidDebug() 로 인증 상태 확인 */
window._raidDebug = function () {
    console.group('[Raid Debug]');
    console.log('_raidIsHost    :', _raidIsHost);
    console.log('_getMyCharId() :', _getMyCharId());
    console.log('currentTurn    :', RaidState.currentPlayerTurn);
    console.groupEnd();
};

/**
 * 주사위 표기법 파싱 및 롤.
 * @param {string} notation - "2d6+1" 형태
 * @returns {number} 최소 1 이상의 합산 결과
 */
function rollDice(notation) {
    const m = String(notation).match(/(\d+)d(\d+)([+-]\d+)?/);
    if (!m) return parseInt(notation) || 1;
    let total = 0;
    for (let i = 0; i < parseInt(m[1]); i++)
        total += Math.floor(Math.random() * parseInt(m[2])) + 1;
    if (m[3]) total += parseInt(m[3]);
    return Math.max(1, total);
}

/** 1~100 무작위 정수 */
function roll100() { return Math.floor(Math.random() * 100) + 1; }

/**
 * 스탯 대비 퍼센트 판정.
 * @param {number} stat - 판정 기준 스탯 값
 * @returns {{ roll, result, success, level }} 판정 결과
 */
function checkStat(stat) {
    const r = roll100();
    let result, level;
    if      (r === 1)                   { result = '결정적 성공'; level =  3; }
    else if (r <= Math.floor(stat / 5)) { result = '극단적 성공'; level =  2; }
    else if (r <= Math.floor(stat / 2)) { result = '어려운 성공'; level =  1; }
    else if (r <= stat)                 { result = '보통 성공';   level =  0; }
    else if (r >= 96)                   { result = '결정적 실패'; level = -2; }
    else                                { result = '실패';         level = -1; }
    return { roll: r, result, success: level >= 0, level };
}

/**
 * 데미지 최종 계산.
 * @param {string} notation - 주사위 표기법
 * @param {boolean} isCrit  - 결정적 성공 여부 (×2)
 * @param {boolean} useBp   - 법력 소비 여부 (×2, isCrit와 중첩 가능)
 * @returns {number}
 */
function rollDamageFull(notation, isCrit, useBp) {
    let dmg = rollDice(notation);
    if (isCrit) dmg *= 2;
    if (useBp)  dmg *= 2;
    return dmg;
}

/* 부위 ID로 보스 부위 객체를 찾는 헬퍼 (파괴된 부위 제외) */
function _getPartById(id)     { return RaidState.boss?.parts.find(p => p.id === id && !p.broken); }
/* 파괴 여부 상관없이 부위 찾기 */
function _getBossPartById(id) { return RaidState.boss?.parts.find(p => p.id === id); }

/* ─────────────────────────────────────────────────────────────
   [더미 보스 데이터] 실제 서비스에서는 DB 또는 별도 데이터 파일로 교체
───────────────────────────────────────────────────────────── */
const RAID_BOSSES = {
    /* 보스 A: 가나다 — 혼돈형 (물리 반감, 기운 파괴로 페널티 해제) */
    ganada: {
        id: 'ganada', name: '가나다(假那多)',
        desc: '형체 없는 혼돈의 기운.',
        maxHp: 260, speedBase: 20,
        gimmick: '물리 스탯 반감 (도술 제외). 기운(좌/우) 파괴 시 페널티 해제.',
        parts: [
            { id: 'core',   name: '핵',      maxHp: 80 },
            { id: 'aura_l', name: '기운(좌)', maxHp: 60 },
            { id: 'aura_r', name: '기운(우)', maxHp: 60 },
            { id: 'vortex', name: '소용돌이', maxHp: 60 },
        ],
        patterns: ['탁기 방류', '기억 흐리기', '무작위 충돌', '소용돌이 강화'],
    },

    /* 보스 B: 나다라 — 탐욕형 (회피 필수, 흡혈) */
    nadara: {
        id: 'nadara', name: '나다라(那多羅)',
        desc: '탐욕의 화신.',
        maxHp: 300, speedBase: 17,
        gimmick: '회피 필수. 위턱/아래턱 파괴 시 흡혈 불가. 눈 파괴 시 명중 감소.',
        parts: [
            { id: 'jaw_u', name: '위턱',    maxHp: 70 },
            { id: 'jaw_l', name: '아래턱',  maxHp: 70 },
            { id: 'eye_l', name: '왼눈',    maxHp: 40 },
            { id: 'eye_r', name: '오른눈',  maxHp: 40 },
            { id: 'body',  name: '몸통',    maxHp: 80 },
        ],
        patterns: ['탐식의 아가리', '흡혈 맹습', '눈빛 마비', '재생 회복'],
    },

    /* 보스 C: 다라마 — 속도형 (연속 공격, 앞발 파괴로 연속 불가) */
    darama: {
        id: 'darama', name: '다라마(多羅馬)',
        desc: '불운을 먹는 맹수.',
        maxHp: 220, speedBase: 35,
        gimmick: '운 주사위(1d6). 짝수=치명타. 앞발 파괴 시 연속 공격 불가.',
        parts: [
            { id: 'head',    name: '머리',     maxHp: 50 },
            { id: 'front_l', name: '앞발(좌)', maxHp: 40 },
            { id: 'front_r', name: '앞발(우)', maxHp: 40 },
            { id: 'body',    name: '몸통',     maxHp: 55 },
            { id: 'tail',    name: '꼬리',     maxHp: 35 },
        ],
        patterns: ['급습', '연속 발톱 공격', '불운의 저주', '최약체 표적'],
    },

    /* 보스 D: 라마바 — 탱커형 (광역, 뿔 파괴로 데미지 감소) */
    ramaba: {
        id: 'ramaba', name: '라마바(羅馬巴)',
        desc: '맹목적 파괴의 화신.',
        maxHp: 350, speedBase: 12,
        gimmick: '회피 불가/광역. 뿔 파괴 시 데미지 감소. 하체 파괴 시 선공 불가.',
        parts: [
            { id: 'horn',  name: '뿔',    maxHp: 60 },
            { id: 'arm_l', name: '팔(좌)', maxHp: 80 },
            { id: 'arm_r', name: '팔(우)', maxHp: 80 },
            { id: 'torso', name: '상체',   maxHp: 90 },
            { id: 'legs',  name: '하체',   maxHp: 40 },
        ],
        patterns: ['맹렬 돌진 (광역)', '뿔 강타', '팔 휩쓸기', '지진 밟기'],
    },
};

/* ─────────────────────────────────────────────────────────────
   [실시간 채널] Supabase Realtime Broadcast 연동
───────────────────────────────────────────────────────────── */

/**
 * 레이드 룸 ID 기반으로 실시간 채널을 초기화.
 * 이벤트 목록:
 *   game_start   — 방장이 전송, 모든 클라이언트가 레이드 초기화
 *   raid_sync    — 호스트 → 전체, RaidState 전체 동기화
 *   raid_log     — 호스트 → 전체, 로그 메시지 동기화
 *   raid_effect  — 호스트 → 전체, 플로팅 이펙트 동기화
 *   action_req   — 비호스트 → 호스트, 행동 요청
 */
function initRealtimeChannel(roomId) {
    /* 기존 채널이 있으면 제거 후 재구독 */
    if (window.raidChannel) supabaseClient.removeChannel(window.raidChannel);
    window.raidChannel = supabaseClient.channel('raid_sync_' + roomId);

    window.raidChannel
        /* ── game_start: 방 생성 신호 ──
           hostId를 함께 전달 → 각 클라이언트가 자신이 호스트인지 판단 */
        .on('broadcast', { event: 'game_start' }, (p) => {
            const { bossId, members, roomId: rid, hostId } = p.payload;
            const myId = _getMyCharId();

            /* 나의 charId === hostId면 호스트 권한 취득 */
            _raidIsHost = (myId !== null && myId === hostId);
            console.log(`[Raid] game_start | myId=${myId} | hostId=${hostId} | isHost=${_raidIsHost}`);

            window._raidRoomId = rid;
            window.initRaid(bossId, members);
        })

        /* ── raid_sync: 상태 전체 동기화 ── */
        .on('broadcast', { event: 'raid_sync' }, (p) => {
            if (!_raidIsHost) {
                Object.assign(RaidState, p.payload);
                _renderRaidUI();

                /* 비호스트도 자기 턴이 오면 액션 패널을 연다 */
                const cur  = RaidState.currentPlayerTurn;
                const myId = _getMyCharId();
                if (cur && myId && myId === cur.id && RaidState.isActive && !RaidState.awaitingInput) {
                    _enablePlayerActions(cur);
                } else if (cur && RaidState.isActive && !RaidState.awaitingInput) {
                    _setWaitMode(true, `${cur.name}의 행동을 기다리는 중...`);
                }

                /* 비호스트: 종료 상태 감지 → 결과창 표시 */
                if (p.payload.isActive === false) {
                    const alive = (p.payload.party || []).filter(pl => !pl.isDead);
                    if      (p.payload.boss?.hp <= 0)  setTimeout(() => window.showRaidResult(true),  600);
                    else if (alive.length === 0)        setTimeout(() => window.showRaidResult(false), 600);
                }
            }
        })

        /* ── raid_log: 로그 메시지 동기화 ── */
        .on('broadcast', { event: 'raid_log' }, (p) => {
            if (!_raidIsHost) raidLog(p.payload.msg, p.payload.cls, true);
        })

        /* ── raid_effect: 플로팅 이펙트 동기화 ── */
        .on('broadcast', { event: 'raid_effect' }, (p) => {
            if (!_raidIsHost) {
                const { type, targetId, text, cls } = p.payload;
                if      (type === 'boss_float')   _spawnEffectOnBoss(text, cls, true);
                else if (type === 'player_float')  _spawnEffectOnPlayer(targetId, text, cls, true);
                else if (type === 'shake_player') {
                    const el = document.getElementById(`raidCard_${targetId}`);
                    if (el) { _shakeEl(el); _flashEl(el, 'raid-flash-hit'); }
                }
            }
        })

        /* ── action_req: 비호스트 행동 요청 수신 (호스트만 처리) ── */
        .on('broadcast', { event: 'action_req' }, (p) => {
            if (_raidIsHost) handleRemoteAction(p.payload);
        })

        .subscribe((status) => {
            console.log('[Raid] 채널 상태:', status);
        });
}

/* ─────────────────────────────────────────────────────────────
   [DB 영속 저장] Supabase raid_rooms 테이블
───────────────────────────────────────────────────────────── */

/** 현재 RaidState를 DB에 upsert (호스트 전용) */
async function saveRaidRoom() {
    if (!_raidIsHost || !window._raidRoomId) return;
    try {
        await supabaseClient.from('raid_rooms').upsert({
            id:         window._raidRoomId,
            boss_id:    RaidState.boss?.id || '',
            state:      RaidState,
            is_active:  RaidState.isActive,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
    } catch (e) { console.warn('[Raid] saveRaidRoom 실패:', e); }
}

/** 특정 룸 ID의 데이터를 DB에서 불러오기 */
async function loadRaidRoom(roomId) {
    const { data, error } = await supabaseClient
        .from('raid_rooms').select('*').eq('id', roomId).maybeSingle();
    if (error || !data) return null;
    return data;
}

/** 현재 활성화된 방 목록 조회 (최근 순 10개) */
async function listActiveRaidRooms() {
    const { data, error } = await supabaseClient
        .from('raid_rooms')
        .select('id, boss_id, state, is_active, updated_at')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(10);
    if (error) return [];
    return data || [];
}

/** 방 비활성화 처리 (레이드 종료 시 호출) */
async function closeRaidRoom(roomId) {
    if (!roomId) return;
    await supabaseClient.from('raid_rooms').update({
        is_active: false, updated_at: new Date().toISOString(),
    }).eq('id', roomId);
}

/* ─────────────────────────────────────────────────────────────
   [동기화] RaidState 브로드캐스트 + DB 저장 (debounced)
───────────────────────────────────────────────────────────── */
function syncRaidState() {
    if (!_raidIsHost || !window.raidChannel) return;

    /* 채널이 SUBSCRIBED 상태가 아니면 전송 스킵 */
    if (window.raidChannel.state !== 'joined') {
        console.warn('[Raid] 채널 미연결, 동기화 스킵');
        return;
    }

    window.raidChannel.send({
        type: 'broadcast', event: 'raid_sync', payload: RaidState,
    });

    /* DB 저장은 1.5초 딜레이로 묶어서 처리 (너무 잦은 DB 호출 방지) */
    clearTimeout(window._raidSaveTimer);
    window._raidSaveTimer = setTimeout(saveRaidRoom, 1500);
}

/** 특정 이펙트를 비호스트에게 브로드캐스트 */
function broadcastEffect(type, targetId, text, cls) {
    if (_raidIsHost && window.raidChannel)
        window.raidChannel.send({
            type: 'broadcast', event: 'raid_effect',
            payload: { type, targetId, text, cls },
        });
}

/** 비호스트가 행동을 호스트에게 요청 */
function requestAction(type, extra) {
    if (window.raidChannel)
        window.raidChannel.send({
            type: 'broadcast', event: 'action_req',
            payload: { type, requesterId: _getMyCharId(), ...extra },
        });
}

/** 호스트: 비호스트의 행동 요청을 수신하여 실행 */
function handleRemoteAction(req) {
    const { type, requesterId, weaponIdx, targetPartId, useBp,
            healType, targetId, amount, saviorId } = req;

    /* 본인 턴이 아닌 요청 무시 (RESCUE 예외) */
    if (RaidState.currentPlayerTurn?.id !== requesterId && type !== 'RESCUE') return;

    if      (type === 'ATTACK')      window.executePlayerAction(weaponIdx, targetPartId, useBp, true);
    else if (type === 'HEAL')        window.executeHeal(healType, targetId, true);
    else if (type === 'PASS')        window.executePass(true);
    else if (type === 'BP_TRANSFER') window.executeBpTransfer(requesterId, targetId, amount, true);
    else if (type === 'RESCUE')      window.executeRescue(saviorId, targetId, true);
}

/* ─────────────────────────────────────────────────────────────
   [로그] 사이드바 전투 기록 출력
───────────────────────────────────────────────────────────── */
/**
 * 로그 메시지를 출력하고 호스트일 경우 비호스트에게 브로드캐스트.
 * @param {string}  msg    - 출력할 HTML 문자열
 * @param {string}  cls    - 'ok' | 'err' | 'warn' | 'sys' | ''
 * @param {boolean} isSync - true면 브로드캐스트하지 않음 (수신된 메시지)
 */
function raidLog(msg, cls, isSync) {
    const box = document.getElementById('raid-combat-log');
    if (box) {
        const d = document.createElement('div');
        /* CSS에서 .log-ok .log-err .log-warn .log-sys 정의 */
        d.className = cls ? `log-${cls}` : '';
        d.style.cssText = 'font-size:12px;line-height:1.8;padding:4px 0;border-bottom:1px solid var(--raid-border-lo);';
        d.innerHTML = msg;
        box.appendChild(d);
        box.scrollTop = box.scrollHeight;
    }
    if (_raidIsHost && !isSync && window.raidChannel)
        window.raidChannel.send({
            type: 'broadcast', event: 'raid_log', payload: { msg, cls },
        });
}

/* ─────────────────────────────────────────────────────────────
   [이펙트] 플로팅 텍스트 + 흔들림 + 플래시
───────────────────────────────────────────────────────────── */

/**
 * 특정 DOM 요소 위에 플로팅 텍스트를 생성.
 * (position:fixed 사용 — iframe 외부 body 기준)
 */
function _spawnFloatingText(text, cls, anchorEl) {
    if (!anchorEl) return;
    const rect  = anchorEl.getBoundingClientRect();
    const el    = document.createElement('div');
    const offX  = (Math.random() - 0.5) * 30;

    /* 흑백 테마: cls에 따라 흰색 계열만 사용 */
    const colorMap = { ok: '#d0ffd8', err: '#ffd8d8', warn: '#fdf4d0', sys: '#ffffff' };
    const color = colorMap[cls] || '#e0e0e0';

    el.style.cssText = [
        'position:fixed;pointer-events:none;z-index:99999;',
        `font-family:'Noto Serif KR',serif;font-weight:700;font-size:22px;`,
        'animation:raidFloat 1.4s ease-out forwards;white-space:nowrap;',
        `left:${rect.left + rect.width / 2 + offX}px;`,
        `top:${rect.top + 10}px;`,
        `color:${color};`,
    ].join('');
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1500);
}

/** 요소에 흔들림 애니메이션 적용 */
function _shakeEl(el) {
    if (!el) return;
    el.classList.remove('raid-shake'); void el.offsetWidth;
    el.classList.add('raid-shake');
    setTimeout(() => el.classList.remove('raid-shake'), 450);
}

/** 요소에 플래시 클래스 적용 후 제거 */
function _flashEl(el, cls) {
    if (!el) return;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 550);
}

/* 외부에서 참조 가능하도록 노출 */
window.shakeEl = _shakeEl;
window.flashEl = _flashEl;

/** 보스 카드 위에 플로팅 텍스트 표시 */
function _spawnEffectOnBoss(text, cls, isSync) {
    const el = document.getElementById('raidBossCard');
    _spawnFloatingText(text, cls, el);
    if (el) _flashEl(el, 'raid-flash-hit');
    if (_raidIsHost && !isSync && window.raidChannel)
        window.raidChannel.send({
            type: 'broadcast', event: 'raid_effect',
            payload: { type: 'boss_float', text, cls },
        });
}

/** 파티원 카드 위에 플로팅 텍스트 표시 */
function _spawnEffectOnPlayer(playerOrId, text, cls, isSync) {
    const id = typeof playerOrId === 'string' ? playerOrId : playerOrId.id;
    const el = document.getElementById(`raidCard_${id}`);
    _spawnFloatingText(text, cls, el);
    if (_raidIsHost && !isSync && window.raidChannel)
        window.raidChannel.send({
            type: 'broadcast', event: 'raid_effect',
            payload: { type: 'player_float', targetId: id, text, cls },
        });
}

/* ─────────────────────────────────────────────────────────────
   [로비 UI]
───────────────────────────────────────────────────────────── */

/**
 * 로비 UI를 지정 컨테이너에 렌더링.
 * @param {string}   containerId - 로비를 표시할 DOM 요소 ID
 * @param {Array}    characters  - 선택 가능한 캐릭터 배열
 * @param {Function} onStart     - 레이드 시작 콜백 (미사용, 내부에서 처리)
 */
window.initRaidLobby = function (containerId, characters, onStart) {
    RaidState.joined        = [];
    RaidState.selectedBossId = null;
    const container = document.getElementById(containerId);
    if (!container) return;

    async function render() {
        const joined  = RaidState.joined;
        const selBoss = RaidState.selectedBossId;
        const canStart = selBoss && joined.length >= 1;
        const rooms    = await listActiveRaidRooms();

        container.innerHTML = `
        <div class="raid-lobby">
          <h2 class="raid-lobby-title">사흉수 토벌</h2>
          <p class="raid-lobby-subtitle">보스를 선택하고 참여자를 확정한 뒤 토벌을 시작하세요</p>

          ${rooms.length > 0 ? `
          <p class="raid-lobby-section-label">-- ACTIVE ROOMS --</p>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px;">
            ${rooms.map(r => {
                const boss  = RAID_BOSSES[r.boss_id];
                const s     = r.state;
                const party = (s.party || []).map(p => p.name).join(', ');
                const hpPct = boss
                    ? Math.round((s.boss?.hp || 0) / (s.boss?.maxHp || 1) * 100)
                    : 0;
                return `<div style="background:var(--raid-card);border:1px solid var(--raid-border-md);border-radius:var(--raid-radius-sm);
                               padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;">
                  <div>
                    <div style="font-size:13px;color:var(--raid-text-hi);font-weight:700;">${boss?.name || r.boss_id}</div>
                    <div style="font-size:11px;color:var(--raid-text-dim);margin-top:3px;">
                      파티: ${party || '없음'} / 보스 HP ${hpPct}% / 라운드 ${s.currentRound || 0}
                    </div>
                  </div>
                  <button onclick="window._raidLobbyJoinRoom('${r.id}')"
                    style="background:var(--raid-card-active);border:1px solid var(--raid-border-hi);color:var(--raid-text-hi);
                           font-family:var(--raid-font-ui);font-size:11px;padding:7px 14px;border-radius:var(--raid-radius-sm);cursor:pointer;">입장하기</button>
                </div>`;
            }).join('')}
          </div>` : ''}

          <p class="raid-lobby-section-label">-- SELECT BOSS --</p>
          <div class="raid-boss-select-grid">
            ${Object.values(RAID_BOSSES).map(b => `
            <div class="raid-boss-option${selBoss === b.id ? ' selected' : ''}"
                 onclick="window._raidLobbySelectBoss('${b.id}')">
              <div class="raid-boss-option-name">${b.name}</div>
              <div class="raid-boss-option-desc">${b.desc}</div>
              <div class="raid-boss-option-gimmick">${b.gimmick}</div>
            </div>`).join('')}
          </div>

          <p class="raid-lobby-section-label">-- SELECT PARTY --</p>
          <div class="raid-member-list">
            ${(characters || []).map(p => {
                const isJoined = joined.includes(p.id);
                return `<div class="raid-member-row${isJoined ? ' joined' : ''}">
                  <span class="raid-member-name">${p.name}</span>
                  <button class="raid-member-join-btn${isJoined ? ' joined' : ''}"
                          onclick="window._raidLobbyToggleJoin('${p.id}')">
                    ${isJoined ? '확정됨' : 'JOIN'}
                  </button>
                </div>`;
            }).join('')}
          </div>

          <button class="raid-lobby-start-btn" onclick="window._raidLobbyStart()" ${canStart ? '' : 'disabled'}>
            ${!canStart
                ? '보스와 참여자를 선택하세요'
                : joined.length === 1
                    ? 'SOLO — 토벌 시작'
                    : `${joined.length}인 파티 — 토벌 시작`}
          </button>
        </div>`;
    }

    /* 보스 선택 */
    window._raidLobbySelectBoss = id => { RaidState.selectedBossId = id; render(); };

    /* 참여자 토글 */
    window._raidLobbyToggleJoin = pid => {
        const idx = RaidState.joined.indexOf(pid);
        if (idx >= 0) RaidState.joined.splice(idx, 1);
        else          RaidState.joined.push(pid);
        render();
    };

    /* 토벌 시작 */
    window._raidLobbyStart = () => {
        if (!RaidState.selectedBossId || RaidState.joined.length < 1) return;

        window._raidRoomId = 'room_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        const members = (characters || []).filter(p => RaidState.joined.includes(p.id));
        const hostId  = _getMyCharId();

        /* 방장은 broadcast 전에 직접 호스트 플래그 세팅 후 로컬 initRaid 호출
           (Supabase broadcast는 송신자가 자신의 메시지를 수신하지 못하기 때문) */
        _raidIsHost = true;

        window.raidChannel.send({
            type: 'broadcast', event: 'game_start',
            payload: { bossId: RaidState.selectedBossId, members, roomId: window._raidRoomId, hostId },
        });

        initRealtimeChannel(window._raidRoomId);
        window.initRaid(RaidState.selectedBossId, members);
    };

    /* 기존 방 재입장 */
    window._raidLobbyJoinRoom = async (roomId) => {
        const data = await loadRaidRoom(roomId);
        if (!data) { alert('방을 찾을 수 없습니다.'); return; }
        window._raidRoomId = roomId;
        _raidIsHost = false;
        Object.assign(RaidState, data.state);
        initRealtimeChannel(roomId);
        _renderRaidUI();
        raidLog('[시스템] 방에 재입장했습니다.', 'sys');
        _setWaitMode(true, '호스트의 진행을 기다리는 중...');
    };

    render();
};

/* 시간 경과 문자열 헬퍼 ("N분 전" 등) */
function _timeAgo(isoStr) {
    const diff = Math.floor((Date.now() - new Date(isoStr)) / 1000);
    if (diff < 60)   return diff + '초 전';
    if (diff < 3600) return Math.floor(diff / 60) + '분 전';
    return Math.floor(diff / 3600) + '시간 전';
}

/* ─────────────────────────────────────────────────────────────
   [레이드 DOM 생성] HTML 골격을 지정 컨테이너에 삽입
───────────────────────────────────────────────────────────── */
window.buildRaidDOM = function (containerId, bossName, onRetreat) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
    <div class="raid-wrap">
      <header class="raid-header">
        <div class="raid-title" id="raidTitleName">${bossName || '사흉수'} 토벌</div>
        <span class="raid-round-banner" id="raidRoundBanner"></span>
        <button class="raid-retreat-btn"
          onclick="(${onRetreat ? onRetreat.toString() : 'window.endRaid'})()">RETREAT</button>
      </header>

      <main class="raid-field">
        <section class="raid-boss-zone">
          <div class="raid-zone-title">BOSS</div>
          <div id="raidBossArea"></div>
        </section>
        <section class="raid-party-zone">
          <div class="raid-zone-title">PARTY</div>
          <div class="raid-party-grid" id="raidPartyArea"></div>
        </section>
      </main>

      <aside class="raid-sidebar">
        <div class="raid-log-area">
          <div class="raid-log-title">COMBAT LOG</div>
          <div id="raid-combat-log" class="raid-log-scroll"></div>
        </div>
        <div class="raid-action-panel" id="raidActionArea">
          <div class="raid-wait-panel">전투 준비 중...
            <div class="raid-wait-dots">
              <span></span><span></span><span></span>
            </div>
          </div>
        </div>
      </aside>
    </div>`;
};

/* ─────────────────────────────────────────────────────────────
   [레이드 초기화] 보스 ID + 파티원 배열로 전투 시작
───────────────────────────────────────────────────────────── */
window.initRaid = function (bossId, partyMembers) {
    if (!partyMembers?.length) return alert('파티원이 없습니다.');
    const template = RAID_BOSSES[bossId];
    if (!template)  return alert(`알 수 없는 보스 ID: ${bossId}`);

    if (window._raidRoomId) initRealtimeChannel(window._raidRoomId);

    /* ── 인원수별 난이도 스케일 ──
       1인: HP×0.45 / 데미지×0.45 / 속도×0.60
       2인: HP×0.65 / 데미지×0.65 / 속도×0.80
       3인: HP×0.82 / 데미지×0.82 / 속도×0.90
       4인+: ×1.00 (풀 난이도)                */
    const pCount = partyMembers.length;
    const SCALE  = [
        null,
        { hp: 0.45, dmg: 0.45, spd: 0.60 },
        { hp: 0.65, dmg: 0.65, spd: 0.80 },
        { hp: 0.82, dmg: 0.82, spd: 0.90 },
    ];
    const scale    = SCALE[pCount] || { hp: 1.0, dmg: 1.0, spd: 1.0 };
    const hpMulti  = scale.hp;

    RaidState.bossDmgMulti   = scale.dmg;
    RaidState.bossSpeedMulti = scale.spd;

    /* 보스 초기화 (부위 HP도 동일 배율) */
    RaidState.boss = {
        ...template,
        hp:    Math.round(template.maxHp * hpMulti),
        maxHp: Math.round(template.maxHp * hpMulti),
        parts: template.parts.map(pt => ({
            ...pt,
            hp:     Math.round(pt.maxHp * hpMulti),
            maxHp:  Math.round(pt.maxHp * hpMulti),
            broken: false,
        })),
    };

    /* 파티원 초기화 (weapon_data JSON 파싱 후 실제 기능치 적용) */
    RaidState.party = partyMembers.map(p => {
        let wd = {};
        if (p.weapon_data) {
            try { wd = typeof p.weapon_data === 'string' ? JSON.parse(p.weapon_data) : p.weapon_data; }
            catch (e) { console.warn('[Raid] weapon_data 파싱 오류:', e); }
        }

        /* 기능치 우선순위: weapon_data > p.stats > 기본값 */
        const stats = {
            brawl:    wd.brawl    || p.stats?.brawl    || 25,
            sword:    wd.sword    || p.stats?.sword     || 25,
            bow:      wd.bow      || p.stats?.bow       || 25,
            throw:    wd.throw    || p.stats?.throw     || 20,
            magic:    wd.magic    || p.stats?.magic     || 15,
            dodge:    wd.dodge    || p.stats?.dodge     || 30,
            drive:    wd.drive    || p.stats?.drive     || 50,
            firstaid: wd.firstaid || p.stats?.firstaid  || 35,
            medic:    wd.medic    || p.stats?.medic      || 30,
        };

        return {
            id:       p.id,
            name:     p.name,
            image:    p.image || null,
            stats,
            weapons:  wd.weapons || p.weapons || [{ name: '맨주먹', dmg: '1d3', type: 'brawl' }],
            hp:       wd.maxHp || p.hp    || p.stats?.hp    || 10,
            maxHp:    wd.maxHp || p.maxHp || p.stats?.maxHp || 10,
            mp:       wd.maxMp || p.mp    || p.stats?.mp    || 10,
            maxMp:    wd.maxMp || p.maxMp || p.stats?.maxMp || 10,
            bp:       wd.bp    || p.stats?.bp    || 100,
            maxBp:    wd.bp    || p.stats?.maxBp || p.stats?.bp || 100,
            isDead:   false,
            statuses: [],
        };
    });

    RaidState.currentRound      = 0;
    RaidState.turnQueue         = [];
    RaidState.isActive          = true;
    RaidState.currentPlayerTurn = null;
    RaidState.awaitingInput     = false;

    /* 타이틀 업데이트 */
    const titleEl = document.getElementById('raidTitleName');
    if (titleEl) titleEl.textContent = `${RaidState.boss.name} 토벌`;

    _renderRaidUI();

    if (_raidIsHost) {
        const diffLabel =
            pCount === 1 ? 'SOLO' :
            pCount === 2 ? '2-PLAYER' :
            pCount === 3 ? '3-PLAYER' : `${pCount}-PLAYER FULL`;
        raidLog(`=== ${RaidState.boss.name} 출현! ===`, 'sys');
        raidLog(`[DIFFICULTY] ${diffLabel} — HP x${scale.hp} / ATK x${scale.dmg} / SPD x${scale.spd}`, 'warn');
        syncRaidState();
        setTimeout(startNewRound, 800);
    } else {
        raidLog('토벌 준비 완료. 호스트의 시작을 기다립니다.', 'warn');
        _setWaitMode(true, '호스트의 진행을 기다리는 중...');
    }
};

/* ─────────────────────────────────────────────────────────────
   [라운드 관리] 이니셔티브 정렬 후 턴 큐 구성
───────────────────────────────────────────────────────────── */
function startNewRound() {
    if (!RaidState.isActive || !_raidIsHost) return;

    RaidState.currentRound++;
    RaidState.turnQueue = [];

    /* 라운드 배너 업데이트 */
    const banner = document.getElementById('raidRoundBanner');
    if (banner) banner.textContent = `ROUND ${RaidState.currentRound}`;

    raidLog(`\n--- ROUND ${RaidState.currentRound} ---`, 'sys');

    /* 파티원 이니셔티브: 1d100 + 속도 스탯 */
    RaidState.party.forEach(p => {
        if (!p.isDead)
            RaidState.turnQueue.push({
                type: 'player', ref: p,
                init: roll100() + (p.stats.drive || 50),
            });
    });

    /* 보스 이니셔티브 (하체 파괴 시 0으로 고정) */
    if (RaidState.boss.hp > 0) {
        const legs      = _getBossPartById('legs');
        const legsBlock = RaidState.boss.id === 'ramaba' && legs?.broken;
        const baseSpd   = RaidState.boss.speedBase * (RaidState.bossSpeedMulti ?? 1.0);
        const bossInit  = legsBlock ? 0 : roll100() + Math.round(baseSpd);
        RaidState.turnQueue.push({ type: 'boss', ref: RaidState.boss, init: bossInit });
    }

    /* 높은 이니셔티브 우선 정렬 */
    RaidState.turnQueue.sort((a, b) => b.init - a.init);
    syncRaidState();
    processNextTurn();
}

/* ─────────────────────────────────────────────────────────────
   [턴 처리] 큐에서 순서대로 실행
───────────────────────────────────────────────────────────── */
function processNextTurn() {
    if (!RaidState.isActive || !_raidIsHost) return;

    const alivePlayers = RaidState.party.filter(p => !p.isDead);

    /* 전멸 → 패배 */
    if (alivePlayers.length === 0) {
        RaidState.isActive = false;
        raidLog('파티가 전멸했습니다. 토벌 실패.', 'err');
        _disableAllActions();
        syncRaidState();
        setTimeout(() => window.showRaidResult(false), 1000);
        return;
    }

    /* 보스 처치 → 승리 */
    if (RaidState.boss.hp <= 0) {
        RaidState.isActive = false;
        raidLog(`${RaidState.boss.name} 토벌 성공!`, 'ok');
        _disableAllActions();
        syncRaidState();
        setTimeout(() => window.showRaidResult(true), 1000);
        return;
    }

    /* 큐 소진 → 다음 라운드 */
    if (RaidState.turnQueue.length === 0) {
        return setTimeout(startNewRound, 1500);
    }

    const cur = RaidState.turnQueue.shift();

    if (cur.type === 'player') {
        if (cur.ref.isDead) { processNextTurn(); return; }

        /* 상태이상: 턴스킵 처리 */
        if (cur.ref.statuses.includes('turnSkip')) {
            cur.ref.statuses = cur.ref.statuses.filter(s => s !== 'turnSkip');
            raidLog(`[${cur.ref.name}] 이번 턴을 건너뜁니다.`, 'warn');
            syncRaidState();
            setTimeout(processNextTurn, 700);
            return;
        }

        RaidState.currentPlayerTurn = cur.ref;
        raidLog(`[${cur.ref.name}의 턴] 행동을 선택하세요.`, 'warn');
        _renderRaidUI();
        syncRaidState();
        _enablePlayerActions(cur.ref);

    } else {
        /* 보스 턴 */
        RaidState.currentPlayerTurn = null;
        _renderRaidUI();
        _setWaitMode(true, '보스가 행동 중...');
        syncRaidState();
        setTimeout(executeBossTurn, 1200);
    }
}

/* ─────────────────────────────────────────────────────────────
   [플레이어 행동] 공격 / 치료 / 대기 / 법력 전달 / 구출
───────────────────────────────────────────────────────────── */

/** 공격 실행 */
window.executePlayerAction = function (weaponIdx, targetPartId, useBp, isInternal = false) {
    /* 비호스트는 호스트에게 요청 후 종료 */
    if (!_raidIsHost && !isInternal) {
        requestAction('ATTACK', { weaponIdx, targetPartId, useBp });
        return;
    }

    const player = RaidState.currentPlayerTurn;
    if (!player || !RaidState.isActive || RaidState.awaitingInput) return;

    const weapon  = player.weapons[weaponIdx] || player.weapons[0];
    let statVal   = player.stats[weapon.type] || 25;

    /* 법력 소비 */
    if (useBp) {
        if (player.bp < 5) { raidLog('법력이 부족합니다!', 'err'); return; }
        player.bp -= 5;
        raidLog(`[${player.name}] 법력 5점 소비`, 'warn');
    }

    /* 상태이상: 불운의저주 (스탯 절반) */
    if (player.statuses.includes('unluck')) {
        statVal = Math.floor(statVal / 2);
        player.statuses = player.statuses.filter(s => s !== 'unluck');
        raidLog(`${player.name}에게 불운! 이번 판정 스탯 절반.`, 'warn');
    }

    /* 보스별 기믹 적용 */
    const boss = RaidState.boss;
    let extraNote = '';

    /* 가나다 기믹: 물리 스탯 반감 (기운 양쪽 파괴 전까지) */
    if (boss.id === 'ganada' && weapon.type !== 'magic') {
        if (!(_getBossPartById('aura_l')?.broken && _getBossPartById('aura_r')?.broken)) {
            statVal   = Math.floor(statVal / 2);
            extraNote = ' [기운 패널티: 명중 절반]';
        } else {
            extraNote = ' [기운 파괴: 페널티 해제]';
        }
    }

    /* 다라마 기믹: 운 주사위로 치명타/반격 결정 */
    if (boss.id === 'darama') {
        const luck = Math.floor(Math.random() * 6) + 1;
        raidLog(`[다라마 기믹] 운 주사위 ${luck} → ${luck % 2 === 0 ? '치명타' : '반격'}`, 'warn');
        if (luck % 2 === 0) {
            const dmg = rollDamageFull(weapon.dmg, true, useBp);
            _applyDamageToPart(_getPartById(targetPartId) || boss.parts[0], dmg);
            raidLog(`[치명타] ${player.name}의 [${weapon.name}] - ${dmg} 데미지!`, 'ok');
            _spawnEffectOnBoss(`-${dmg}!`, 'ok');
        } else {
            const cDmg = Math.max(1, Math.round(rollDice('1d2') * (RaidState.bossDmgMulti ?? 1.0)));
            _applyDamageToPlayer(player, cDmg);
            raidLog(`다라마 반격! ${player.name} -${cDmg}`, 'err');
            _spawnEffectOnPlayer(player, `-${cDmg}`, 'err');
        }
        _disableAllActions();
        syncRaidState();
        setTimeout(processNextTurn, 1200);
        return;
    }

    _disableAllActions();
    const check = checkStat(statVal);
    raidLog(
        `[${player.name}] [${weapon.name}] d100=${check.roll} → ${check.result}${extraNote}`,
        check.success ? 'ok' : 'err'
    );

    if (!check.success) {
        raidLog(`${player.name}의 공격이 빗나갔습니다.`, 'err');
        syncRaidState();
        setTimeout(processNextTurn, 1000);
        return;
    }

    /* 보스 방어 AI 계산 (비동기 딜레이로 시간감 부여) */
    RaidState.awaitingInput = true;
    raidLog('[보스 방어 계산 중...]', '');
    syncRaidState();

    setTimeout(() => {
        const defType  = Math.random() < 0.5 ? 'counter' : 'dodge';
        _resolveDefense(player, check, targetPartId, useBp, defType, weapon);
    }, 1200);
};

/**
 * 보스 방어 결과 처리.
 * defType: 'counter' (반격) | 'dodge' (회피)
 */
function _resolveDefense(attacker, atkCheck, targetPartId, useBp, defType, weapon) {
    RaidState.awaitingInput = false;
    const boss       = RaidState.boss;
    const targetPart = _getPartById(targetPartId)
        || boss.parts.find(p => !p.broken)
        || boss.parts[0];
    const defCheck   = checkStat(20 + Math.floor(Math.random() * 30));

    raidLog(
        `[보스 ${defType === 'counter' ? '반격' : '회피'}] d100=${defCheck.roll} → ${defCheck.result}`,
        defCheck.success ? 'warn' : 'ok'
    );

    if (defType === 'counter') {
        if (!defCheck.success || defCheck.level < atkCheck.level) {
            /* 공격자 성공 */
            const dmg = rollDamageFull(weapon.dmg, false, useBp);
            _applyDamageToPart(targetPart, dmg);
            raidLog(`${attacker.name} 적중! ${targetPart.name} -${dmg}`, 'ok');
            _spawnEffectOnBoss(`-${dmg}`, 'ok');

        } else if (defCheck.level === atkCheck.level) {
            /* 상호 타격 */
            const dmg  = rollDamageFull(weapon.dmg, false, useBp);
            const cDmg = Math.max(1, Math.round(rollDice('1d2') * (RaidState.bossDmgMulti ?? 1.0)));
            _applyDamageToPart(targetPart, dmg);
            _applyDamageToPlayer(attacker, cDmg);
            raidLog(`상호 타격! ${attacker.name} -${cDmg} / 보스 -${dmg}`, 'warn');
            _spawnEffectOnBoss(`-${dmg}`, 'ok');
            _spawnEffectOnPlayer(attacker, `-${cDmg}`, 'err');

        } else {
            /* 보스 반격 성공 */
            const cDmg = Math.max(1, Math.round(rollDice('1d2+1') * (RaidState.bossDmgMulti ?? 1.0)));
            _applyDamageToPlayer(attacker, cDmg);
            raidLog(`보스 반격 성공! ${attacker.name} -${cDmg}`, 'err');
            _spawnEffectOnPlayer(attacker, `-${cDmg}`, 'err');
        }
    } else {
        /* 회피 판정 */
        if (defCheck.success && defCheck.level >= atkCheck.level) {
            raidLog('보스 회피 성공! 공격이 빗나갔습니다.', 'warn');
        } else {
            const dmg = rollDamageFull(weapon.dmg, false, useBp);
            _applyDamageToPart(targetPart, dmg);
            raidLog(`${attacker.name} 적중! -${dmg}`, 'ok');
            _spawnEffectOnBoss(`-${dmg}`, 'ok');
        }
    }

    syncRaidState();
    setTimeout(processNextTurn, 1000);
}

/** 치료 실행 */
window.executeHeal = function (healType, targetId, isInternal = false) {
    if (!_raidIsHost && !isInternal) { requestAction('HEAL', { healType, targetId }); return; }

    const healer = RaidState.currentPlayerTurn;
    if (!healer) return;
    const target = RaidState.party.find(p => p.id === targetId) || healer;
    _disableAllActions();

    let stat, notation;
    if (healType === 'bp') {
        if (healer.bp < 5) { raidLog('법력 부족!', 'err'); _enablePlayerActions(healer); return; }
        healer.bp -= 5;
        stat = healer.stats.magic || 15; notation = '2d5';
    } else if (healType === 'medic') {
        stat = healer.stats.medic || 30; notation = '1d5';
    } else {
        stat = healer.stats.firstaid || 35; notation = '1d3';
    }

    const check = checkStat(stat);
    raidLog(`[${healer.name}] 치료 시도 d100=${check.roll} → ${check.result}`, check.success ? 'ok' : 'err');

    if (check.success) {
        /* 극단적 성공 이상이면 최대 회복 */
        const heal = check.level >= 1
            ? parseInt(notation.split('d')[1]) * parseInt(notation.split('d')[0])
            : rollDice(notation);
        target.hp = Math.min(target.maxHp, target.hp + heal);
        if (target.isDead) { target.isDead = false; target.hp = Math.max(1, target.hp); }
        raidLog(`${target.name} +${heal} 회복 (${target.hp}/${target.maxHp})`, 'ok');
        _spawnEffectOnPlayer(target, `+${heal}`, 'ok');
        const cardEl = document.getElementById(`raidCard_${target.id}`);
        if (cardEl) _flashEl(cardEl, 'raid-flash-heal');
    } else {
        raidLog('치료 실패.', 'err');
    }

    RaidState.currentPlayerTurn = null;
    syncRaidState();
    setTimeout(processNextTurn, 1000);
};

/** 대기(패스) */
window.executePass = function (isInternal = false) {
    if (!_raidIsHost && !isInternal) { requestAction('PASS', {}); return; }
    raidLog(`[${RaidState.currentPlayerTurn?.name}] 대기합니다.`, '');
    RaidState.currentPlayerTurn = null;
    _disableAllActions();
    syncRaidState();
    setTimeout(processNextTurn, 600);
};

/** 법력 전달 */
window.executeBpTransfer = function (fromId, toId, amount, isInternal = false) {
    if (!_raidIsHost && !isInternal) { requestAction('BP_TRANSFER', { targetId: toId, amount }); return; }
    const from = RaidState.party.find(p => p.id === fromId);
    const to   = RaidState.party.find(p => p.id === toId);
    if (!from || !to) return;
    const actual = Math.min(amount, from.bp);
    from.bp -= actual;
    to.bp    = Math.min(to.maxBp, to.bp + actual);
    raidLog(`[${from.name}] -> [${to.name}] 법력 ${actual}점 전달`, 'warn');
    syncRaidState();
    setTimeout(processNextTurn, 600);
};

/** 구출 (사망한 파티원 HP 1로 부활) */
window.executeRescue = function (saviorId, targetId, isInternal = false) {
    if (!_raidIsHost && !isInternal) { requestAction('RESCUE', { saviorId, targetId }); return; }
    const target = RaidState.party.find(p => p.id === targetId);
    const savior = RaidState.party.find(p => p.id === saviorId);
    if (!target || !savior) return;
    target.isDead = false;
    target.hp     = 1;
    raidLog(`[${savior.name}]이(가) [${target.name}]을(를) 구출했습니다!`, 'ok');
    _spawnEffectOnPlayer(target, '구출!', 'ok');
    syncRaidState();
};

/* ─────────────────────────────────────────────────────────────
   [보스 AI] 패턴 선택 + 공격 실행
───────────────────────────────────────────────────────────── */
function executeBossTurn() {
    const boss  = RaidState.boss;
    const alive = RaidState.party.filter(p => !p.isDead);
    if (alive.length === 0) { processNextTurn(); return; }

    /* HP 33% 이하 시 페이즈 강화 */
    const phaseMulti = (boss.hp / boss.maxHp) < 0.33 ? 1.2 : 1.0;
    const dmgMulti   = (RaidState.bossDmgMulti ?? 1.0) * phaseMulti;

    /* 데미지 롤 헬퍼: 배율 적용 + 최소 1 보장 */
    const _dmg = (notation) => Math.max(1, Math.round(rollDice(notation) * dmgMulti));

    /* 패턴 랜덤 선택 */
    const patIdx    = Math.floor(Math.random() * boss.patterns.length);
    const patternEl = document.getElementById('raidBossPattern');
    const bossCard  = document.getElementById('raidBossCard');

    raidLog(`[${boss.name}] ${boss.patterns[patIdx]}!`, 'err');
    if (patternEl) patternEl.textContent = boss.patterns[patIdx];
    if (bossCard)  _flashEl(bossCard, 'raid-flash-hit');

    /* 공격 대상 무작위 선택 */
    const t = alive[Math.floor(Math.random() * alive.length)];

    /* 보스별 패턴 분기 */
    if (boss.id === 'ganada') {
        if (patIdx <= 1) {
            /* 단일 타격 */
            const d = _dmg('1d2');
            _applyDamageToPlayer(t, d);
            raidLog(` -> ${t.name} -${d}`, 'err');
            _spawnEffectOnPlayer(t, `-${d}`, 'err');
        } else {
            /* 광역 타격 */
            alive.forEach(p => {
                const d = _dmg('1d2');
                _applyDamageToPlayer(p, d);
                raidLog(` -> ${p.name} -${d}`, 'err');
                _spawnEffectOnPlayer(p, `-${d}`, 'err');
            });
        }
    } else if (boss.id === 'ramaba') {
        /* 라마바: 강타 (1d2+1) */
        const d = _dmg('1d2+1');
        _applyDamageToPlayer(t, d);
        raidLog(` -> ${t.name} -${d}`, 'err');
        _spawnEffectOnPlayer(t, `-${d}`, 'err');
    } else {
        /* 기타 보스: 기본 단타 (1d2) */
        const d = _dmg('1d2');
        _applyDamageToPlayer(t, d);
        raidLog(` -> ${t.name} -${d}`, 'err');
        _spawnEffectOnPlayer(t, `-${d}`, 'err');
    }

    syncRaidState();
    setTimeout(processNextTurn, 1500);
}

/* ─────────────────────────────────────────────────────────────
   [데미지 적용] 보스 부위 / 플레이어
───────────────────────────────────────────────────────────── */

/** 보스 부위에 데미지 적용 (보스 총 HP에도 반영) */
function _applyDamageToPart(part, dmg) {
    if (!part) return;
    part.hp           = Math.max(0, part.hp - dmg);
    RaidState.boss.hp = Math.max(0, RaidState.boss.hp - dmg);
    if (part.hp <= 0 && !part.broken) {
        part.broken = true;
        raidLog(`[${part.name}] 파괴!`, 'ok');
        _spawnEffectOnBoss('BREAK!', 'ok');
    }
    _updatePartCard(part);
    _updateBossHPBar();
}

/** 플레이어에 데미지 적용 + 사망 처리 */
function _applyDamageToPlayer(player, dmg) {
    player.hp = Math.max(0, player.hp - dmg);
    if (player.hp <= 0 && !player.isDead) {
        player.hp     = 0;
        player.isDead = true;
        raidLog(`[${player.name}] 전사!`, 'err');
    }
    const cardEl = document.getElementById(`raidCard_${player.id}`);
    if (cardEl) { _shakeEl(cardEl); _flashEl(cardEl, 'raid-flash-hit'); }
    if (_raidIsHost) broadcastEffect('shake_player', player.id, '', '');
    _updatePlayerCard(player);
}

/* ─────────────────────────────────────────────────────────────
   [UI 렌더링] 보스 / 파티원 전체 재렌더링
───────────────────────────────────────────────────────────── */
function _renderRaidUI() {
    _renderBossArea();
    _renderPartyArea();
    const banner = document.getElementById('raidRoundBanner');
    if (banner && RaidState.currentRound > 0)
        banner.textContent = `ROUND ${RaidState.currentRound}`;
}

/* ── 보스 영역 ── */
function _renderBossArea() {
    const area = document.getElementById('raidBossArea');
    if (!area || !RaidState.boss) return;
    const boss = RaidState.boss;
    const hPct = Math.max(0, boss.hp / boss.maxHp * 100).toFixed(1);

    area.innerHTML =
        '<div id="raidBossCard" class="boss-card">'
      + '<div class="boss-name">' + boss.name + '</div>'
      + '<div class="boss-gimmick">' + (boss.gimmick || '') + '</div>'
      + '<div class="hp-bar-wrap">'
      +   '<span class="hp-label">HP</span>'
      +   '<div class="hp-track"><div class="hp-fill" id="bossHpFill" style="width:' + hPct + '%"></div></div>'
      +   '<span class="hp-num" id="bossHpNum">' + boss.hp + ' / ' + boss.maxHp + '</span>'
      + '</div>'
      + '<div id="raidBossPattern" class="boss-pattern-box">대기 중</div>'
      + '</div>'

      + '<div class="raid-zone-title" style="margin-top:14px;">PARTS — click to select target</div>'
      + '<div id="raidPartsGrid">'
      + boss.parts.map(pt => _buildPartHTML(pt)).join('')
      + '</div>';

    /* 부위 클릭 이벤트 바인딩 */
    area.querySelectorAll('.raid-part-card:not(.raid-part-broken)').forEach(card => {
        card.addEventListener('click', () => {
            _raidSelectedPartId = card.dataset.partId;
            /* 모든 부위 선택 해제 후 현재 부위만 표시 */
            area.querySelectorAll('.raid-part-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            const btn = document.getElementById('raidAttackBtn');
            if (btn) { btn.disabled = false; btn.textContent = '공격 판정 실행'; }
        });
    });

    /* 이전에 선택된 부위 유지 */
    if (_raidSelectedPartId) {
        const prev = area.querySelector(`[data-part-id="${_raidSelectedPartId}"]`);
        if (prev && !prev.classList.contains('raid-part-broken')) {
            prev.classList.add('selected');
        } else {
            _raidSelectedPartId = null;
        }
    }
}

/** 부위 카드 HTML 생성 */
function _buildPartHTML(pt) {
    const pPct   = Math.max(0, pt.hp / pt.maxHp * 100).toFixed(1);
    const broken = pt.broken;
    return '<div class="raid-part-card' + (broken ? ' raid-part-broken' : '') + '"'
        + ' data-part-id="' + pt.id + '" id="raidPart_' + pt.id + '">'
        + '<div class="part-name">' + pt.name + '</div>'
        + '<div class="part-hp-track"><div class="part-hp-fill" id="raidPartFill_' + pt.id
        + '" style="width:' + pPct + '%"></div></div>'
        + '<div id="raidPartNum_' + pt.id + '" style="font-size:11px;color:var(--raid-text-muted);font-weight:500;">'
        + pt.hp + ' / ' + pt.maxHp + (broken ? ' [파괴]' : '') + '</div>'
        + '</div>';
}

/** 부위 카드 HP 수치만 부분 업데이트 */
function _updatePartCard(pt) {
    const fill = document.getElementById('raidPartFill_' + pt.id);
    const num  = document.getElementById('raidPartNum_' + pt.id);
    const card = document.getElementById('raidPart_' + pt.id);
    if (fill) fill.style.width = Math.max(0, pt.hp / pt.maxHp * 100).toFixed(1) + '%';
    if (num)  num.textContent  = pt.hp + ' / ' + pt.maxHp + (pt.broken ? ' [파괴]' : '');
    if (card && pt.broken) {
        card.classList.add('raid-part-broken');
        card.classList.remove('selected');
        if (_raidSelectedPartId === pt.id) _raidSelectedPartId = null;
    }
}

/** 보스 HP 바만 부분 업데이트 */
function _updateBossHPBar() {
    const boss = RaidState.boss;
    if (!boss) return;
    const fill = document.getElementById('bossHpFill');
    const num  = document.getElementById('bossHpNum');
    if (fill) fill.style.width = Math.max(0, boss.hp / boss.maxHp * 100).toFixed(1) + '%';
    if (num)  num.textContent  = boss.hp + ' / ' + boss.maxHp;
}

/* ── 파티원 영역 ── */
function _renderPartyArea() {
    const area = document.getElementById('raidPartyArea');
    if (!area) return;
    area.innerHTML = RaidState.party.map(p => _buildPlayerHTML(p)).join('');

    /* 파티원 카드 클릭 → 치료 대상 선택 */
    area.querySelectorAll('.raid-player-card:not(.raid-player-dead)').forEach(card => {
        card.addEventListener('click', () => {
            _raidHealTarget = card.dataset.pid;
            const sel = document.getElementById('raidHealTargetSel');
            if (sel) sel.value = _raidHealTarget;
            /* 선택 표시 */
            area.querySelectorAll('.raid-player-card').forEach(c => {
                c.style.outline = c.dataset.pid === _raidHealTarget
                    ? '2px solid var(--raid-border-top)' : 'none';
            });
        });
    });
}

/** 파티원 카드 HTML 생성 */
function _buildPlayerHTML(p) {
    const hPct   = Math.max(0, p.hp / p.maxHp * 100).toFixed(1);
    const mPct   = Math.max(0, p.mp / p.maxMp * 100).toFixed(1);
    const bPct   = Math.max(0, p.bp / p.maxBp * 100).toFixed(1);
    const isAct  = RaidState.currentPlayerTurn?.id === p.id;

    /* 상태이상 뱃지 */
    const badges = (p.statuses || []).map(s =>
        `<span class="status-badge${s === 'turnSkip' || s === 'unluck' ? ' debuff' : ''}">${s}</span>`
    ).join('');

    return `<div class="raid-player-card${p.isDead ? ' raid-player-dead' : ''}${isAct ? ' active-turn' : ''}"
        data-pid="${p.id}" id="raidCard_${p.id}">
      <div class="player-name">${p.name}${isAct ? ' [>]' : ''}</div>
      <div class="stat-row">
        <span class="stat-lbl">HP</span>
        <div class="stat-track"><div class="stat-fill-hp" id="raidPHP_${p.id}" style="width:${hPct}%"></div></div>
        <span class="stat-val" id="raidPHPNum_${p.id}">${p.hp}/${p.maxHp}</span>
      </div>
      <div class="stat-row">
        <span class="stat-lbl">MP</span>
        <div class="stat-track"><div class="stat-fill-mp" id="raidPMP_${p.id}" style="width:${mPct}%"></div></div>
        <span class="stat-val" id="raidPMPNum_${p.id}">${p.mp}/${p.maxMp}</span>
      </div>
      <div class="stat-row">
        <span class="stat-lbl">BP</span>
        <div class="stat-track"><div class="stat-fill-bp" id="raidPBP_${p.id}" style="width:${bPct}%"></div></div>
        <span class="stat-val" id="raidPBPNum_${p.id}">${p.bp}/${p.maxBp}</span>
      </div>
      ${badges ? `<div style="margin-top:7px;display:flex;flex-wrap:wrap;gap:3px;">${badges}</div>` : ''}
    </div>`;
}

/** 파티원 카드 수치만 부분 업데이트 (리렌더 없이) */
function _updatePlayerCard(p) {
    const hFill = document.getElementById('raidPHP_' + p.id);
    const hNum  = document.getElementById('raidPHPNum_' + p.id);
    const mFill = document.getElementById('raidPMP_' + p.id);
    const mNum  = document.getElementById('raidPMPNum_' + p.id);
    const bFill = document.getElementById('raidPBP_' + p.id);
    const bNum  = document.getElementById('raidPBPNum_' + p.id);
    const card  = document.getElementById('raidCard_' + p.id);

    if (hFill) hFill.style.width = Math.max(0, p.hp / p.maxHp * 100).toFixed(1) + '%';
    if (hNum)  hNum.textContent  = p.hp + '/' + p.maxHp;
    if (mFill) mFill.style.width = Math.max(0, p.mp / p.maxMp * 100).toFixed(1) + '%';
    if (mNum)  mNum.textContent  = p.mp + '/' + p.maxMp;
    if (bFill) bFill.style.width = Math.max(0, p.bp / p.maxBp * 100).toFixed(1) + '%';
    if (bNum)  bNum.textContent  = p.bp + '/' + p.maxBp;

    if (card && p.isDead) {
        card.classList.add('raid-player-dead');
    }
}

/* ─────────────────────────────────────────────────────────────
   [액션 패널] 내 턴일 때 조작 UI 표시
───────────────────────────────────────────────────────────── */
function _enablePlayerActions(player) {
    const area = document.getElementById('raidActionArea');
    if (!area) return;

    const myId = _getMyCharId();

    /* 조작 허용 조건:
       A) 내 캐릭터의 턴 (myId === player.id)
       B) myId를 특정할 수 없음 (null) — 솔로/테스트 모드
       C) 내가 호스트 — 모든 파티원 대리 조작 가능           */
    const isMyTurn = (myId === null) || (myId === player.id) || _raidIsHost;

    if (!isMyTurn) {
        _setWaitMode(true, `${player.name}의 행동을 기다리는 중...`);
        return;
    }

    /* 첫 등장 시 기본 부위 자동 선택 */
    if (!_raidSelectedPartId) {
        const firstPart = RaidState.boss?.parts.find(p => !p.broken);
        if (firstPart) {
            _raidSelectedPartId = firstPart.id;
            const card = document.querySelector(`[data-part-id="${_raidSelectedPartId}"]`);
            if (card) card.classList.add('selected');
        }
    }

    /* 스탯명 한국어 레이블 */
    const statNames = { brawl: '격투', sword: '도검', bow: '활', throw: '투척', magic: '도술' };
    const wpns = player.weapons || [{ name: '맨주먹', dmg: '1d3', type: 'brawl' }];

    /* 무기 드롭다운 옵션 */
    const weaponOpts = wpns.map((w, idx) => {
        const sVal  = player.stats[w.type] || 25;
        const sName = statNames[w.type] || w.type;
        return `<option value="${idx}" ${_raidSelectedWeaponIdx === idx ? 'selected' : ''}>
            ${w.name} [${w.dmg}] ${sName}(${sVal})</option>`;
    }).join('');

    /* 생존 파티원 드롭다운 옵션 */
    const aliveOpts = RaidState.party
        .filter(p => !p.isDead)
        .map(p => `<option value="${p.id}"${_raidHealTarget === p.id ? ' selected' : ''}>${p.name}</option>`)
        .join('');

    area.innerHTML = `
      <div style="padding:14px 16px;">
        <div class="action-turn-title">내 턴 — ${player.name}</div>

        <div class="action-section-label" style="margin-top:12px;">WEAPON</div>
        <select id="raidWeaponSel" class="raid-ctrl-select"
          style="margin:6px 16px 10px;width:calc(100% - 32px);"
          onchange="_raidSelectedWeaponIdx=parseInt(this.value)">
          ${weaponOpts}
        </select>

        <label class="raid-bp-check-row" style="padding:0 16px 10px;">
          <input type="checkbox" id="raidUseBp">
          법력 소비 &nbsp;( -5 BP / 데미지 x2 )
        </label>

        <button id="raidAttackBtn"
          ${_raidSelectedPartId ? '' : 'disabled'}
          onclick="window._raidDoAttack()">
          ${_raidSelectedPartId ? '공격 판정 실행' : '부위를 클릭하여 선택'}
        </button>

        <div style="height:1px;background:var(--raid-border-lo);margin:0 16px 12px;"></div>
        <div class="action-section-label">SUPPORT</div>

        <div class="raid-sub-actions" style="margin-top:6px;">
          <select id="raidHealTypeSel" class="raid-ctrl-select" style="margin-bottom:0;">
            <option value="firstaid">응급처치</option>
            <option value="medic">의료처치</option>
            <option value="bp">법력치료</option>
          </select>
          <select id="raidHealTargetSel" class="raid-ctrl-select" style="margin-bottom:0;"
            onchange="_raidHealTarget=this.value">
            ${aliveOpts}
          </select>
          <button class="raid-sub-btn" onclick="window._raidDoHeal()">HEAL</button>
          <button class="raid-sub-btn" onclick="window.executePass()">WAIT</button>
        </div>
      </div>`;

    if (!_raidHealTarget) {
        _raidHealTarget = player.id;
        const sel = document.getElementById('raidHealTargetSel');
        if (sel) sel.value = player.id;
    }
}

/* 공격 버튼 클릭 핸들러 (전역으로 노출) */
window._raidDoAttack = function () {
    if (!_raidSelectedPartId) { raidLog('타격할 부위를 선택하세요!', 'warn'); return; }
    const useBp = document.getElementById('raidUseBp')?.checked || false;
    window.executePlayerAction(_raidSelectedWeaponIdx, _raidSelectedPartId, useBp);
};

/* 치료 버튼 클릭 핸들러 (전역으로 노출) */
window._raidDoHeal = function () {
    const healType = document.getElementById('raidHealTypeSel')?.value || 'firstaid';
    const target   = _raidHealTarget || RaidState.currentPlayerTurn?.id;
    if (!target) return;
    window.executeHeal(healType, target);
};

/* 무기 선택 변경 핸들러 */
window._raidSelectWeapon = function (idx) {
    _raidSelectedWeaponIdx = idx;
};

/* ─────────────────────────────────────────────────────────────
   [대기 패널] 처리 중 / 다른 플레이어 차례
───────────────────────────────────────────────────────────── */
function _disableAllActions() { _setWaitMode(true, '판정 처리 중...'); }

function _setWaitMode(isWait, msg) {
    const area = document.getElementById('raidActionArea');
    if (area && isWait)
        area.innerHTML = `<div class="raid-wait-panel">${msg || '보스의 행동을 기다리는 중...'}
            <div class="raid-wait-dots">
              <span></span><span></span><span></span>
            </div></div>`;
}

/* ─────────────────────────────────────────────────────────────
   [보상 지급] 레이드 종료 후 캐릭터 프로필에 영석 지급
───────────────────────────────────────────────────────────── */
window.giveRaidRewards = async function () {
    if (!_raidIsHost) return;  /* 호스트만 DB 쓰기 */

    const rewardAmount = 1000;
    const partyIds     = RaidState.party.map(p => p.id);

    for (const pid of partyIds) {
        try {
            /* 현재 캐릭터의 돈 조회 (phase=0 기준) */
            const { data: profiles, error: selectError } = await supabaseClient
                .from('character_profiles')
                .select('money, phase')
                .eq('char_id', pid);

            if (selectError || !profiles?.length) {
                console.warn(`[Reward] ${pid} 조회 실패`);
                continue;
            }

            const profile    = profiles[0];
            const currentMoney = parseInt(String(profile.money || 0).replace(/,/g, ''), 10);
            const newMoney     = currentMoney + rewardAmount;

            /* 업데이트 */
            const { error: updateError } = await supabaseClient
                .from('character_profiles')
                .update({ money: newMoney })
                .eq('char_id', pid)
                .eq('phase', profile.phase);

            if (updateError) {
                console.error(`[Reward] ${pid} 업데이트 실패:`, updateError);
            } else {
                console.log(`[Reward] ${pid} +${rewardAmount} 영석 (합계: ${newMoney})`);
            }
        } catch (e) {
            console.error(`[Reward] ${pid} 처리 오류:`, e);
        }
    }

    raidLog('[시스템] 모든 보상이 지급되었습니다.', 'ok');
};

/* ─────────────────────────────────────────────────────────────
   [결과 오버레이] 승리 / 패배 전체화면 표시
───────────────────────────────────────────────────────────── */
window.showRaidResult = function (isVictory) {
    if (document.getElementById('raidResultOverlay')) return;  /* 중복 방지 */

    const overlay = document.createElement('div');
    overlay.id = 'raidResultOverlay';
    overlay.className = 'raid-result-overlay';

    overlay.innerHTML = isVictory ? `
      <div class="raid-result-title">토벌 성공</div>
      <div class="raid-result-sub">RAID CLEARED</div>
      <div class="raid-result-reward">
        <div class="r-label">REWARD</div>
        <div class="r-value">1,000 영석</div>
      </div>
      <button class="raid-exit-btn" id="raidExitBtn">EXIT RAID</button>
    ` : `
      <div class="raid-result-title">토벌 실패</div>
      <div class="raid-result-sub">PARTY WIPED</div>
      <div class="raid-result-sub">재정비 후 재도전하세요.</div>
      <button class="raid-exit-btn" id="raidExitBtn">EXIT RAID</button>
    `;

    document.body.appendChild(overlay);

    /* onclick 문자열 대신 addEventListener 사용 — CSP 정책 준수 */
    document.getElementById('raidExitBtn').addEventListener('click', () => {
        window.endRaid?.();
        overlay.remove();
    });
};

/* ─────────────────────────────────────────────────────────────
   [레이드 종료] 상태 초기화 + 방 비활성화
───────────────────────────────────────────────────────────── */
window.endRaid = function () {
    RaidState.isActive = false;
    raidLog('토벌이 종료되었습니다.', '');

    const raidWrap = document.querySelector('.raid-wrap');
    if (raidWrap) raidWrap.innerHTML = '';

    if (_raidIsHost) {
        closeRaidRoom(window._raidRoomId);
        syncRaidState();
    }
};

/* ─────────────────────────────────────────────────────────────
   [공개 API] 외부에서 참조 가능한 함수들
───────────────────────────────────────────────────────────── */
window.getRaidState      = () => RaidState;
window.spawnFloatingText = _spawnFloatingText;
