/* ================================================================= */
/*  Config.js — 전역 설정 & 공유 상태                                  */
/*                                                                   */
/*  ⚠️  이 파일을 가장 먼저 로드해야 합니다.                             */
/*  다른 모든 JS 파일은 여기서 선언된 변수를 참조합니다.                  */
/*                                                                   */
/*  ✏️  수정 가이드:                                                   */
/*  1. SUPABASE_URL / SUPABASE_ANON_KEY → 자신의 Supabase 프로젝트 값  */
/*  2. IMGBB_API_KEY → imgbb.com에서 발급한 API 키                     */
/*  3. adminEmails / charOwners → 실제 사용자 이메일로 교체             */
/*  4. charData → 실제 캐릭터 정보로 교체                               */
/* ================================================================= */


/* ─────────────────────────────────────────────────────────────────
   1. 외부 서비스 키
   ✏️  Supabase 대시보드(supabase.com)에서 복사해서 붙여넣으세요.
───────────────────────────────────────────────────────────────── */
const SUPABASE_URL      = 'https://ypvwsesiyxhqfvrylify.supabase.co';
const SUPABASE_ANON_KEY = '여기에_SUPABASE_ANON_KEY를_입력하세요';

/* ✏️  imgbb.com에서 무료로 발급받은 API 키를 넣으세요 */
const IMGBB_API_KEY     = '여기에_IMGBB_API_KEY를_입력하세요';

/* 이미지가 없을 때 표시할 기본 이미지 URL */
const PLACEHOLDER_IMG  = 'https://placehold.co/60x60/1a1a1a/888888?text=?';
const PLACEHOLDER_ITEM = 'https://placehold.co/60x60/1a1a1a/888888?text=Item';
const PLACEHOLDER_100  = 'https://placehold.co/100x100/1a1a1a/888888?text=?';

/* Supabase 클라이언트 초기화 (오류가 나도 사이트가 멈추지 않도록 try-catch 적용) */
let supabaseClient = null;
try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
    console.error('DB 연결 실패:', e);
}


/* ─────────────────────────────────────────────────────────────────
   2. 관리자 & 앱 전역 설정
   ✏️  adminEmails 배열에 관리자로 지정할 이메일을 넣으세요.
───────────────────────────────────────────────────────────────── */
window.APP_CONFIG = {
    /* 관리자 이메일 목록 — 소지금 편집 등 특수 권한을 가집니다 */
    ADMIN_EMAILS: ['admin@example.com'],

    /* 기본으로 표시할 타임라인 번호 (0 = 1부, 1 = 2부, ...) */
    DEFAULT_PHASE: 0
};

/* 어디서든 isAdmin() 함수로 관리자 여부를 확인할 수 있습니다 */
window.isAdmin = function () {
    return currentUser && window.APP_CONFIG.ADMIN_EMAILS.includes(currentUser.email);
};

/* 관리자 이메일 목록 (Auth.js에서도 직접 참조합니다) */
const adminEmails = ['admin@example.com'];


/* ─────────────────────────────────────────────────────────────────
   3. 이메일 → 캐릭터 연결 테이블
   ✏️  키: 로그인 이메일 / 값: 캐릭터 섹션 ID (char-가나다라 형식)
   사용자가 로그인하면 자신의 캐릭터를 편집할 수 있게 됩니다.
───────────────────────────────────────────────────────────────── */
const charOwners = {
    'player1@example.com': 'char-p1',   /* 플레이어 1 → 캐릭터 가나 */
    'player2@example.com': 'char-p2',   /* 플레이어 2 → 캐릭터 다라 */
    'player3@example.com': 'char-p3',   /* 플레이어 3 → 캐릭터 마바 */
    'player4@example.com': 'char-p4',   /* 플레이어 4 → 캐릭터 사아 */
    'admin@example.com':   'char-p5',   /* 관리자도 캐릭터를 가질 수 있습니다 */
};


/* ─────────────────────────────────────────────────────────────────
   4. 캐릭터 기초 데이터 (더미 데이터 — 실제 정보로 교체하세요)
   ✏️  각 항목 설명:
     id    : URL에 사용될 고유 식별자 (영문/숫자 권장)
     name  : 화면에 표시될 캐릭터 이름
     title : 소속 집단 또는 직함
     img   : 기본 프로필 이미지 URL
     quote : 기본 한마디 대사
     stats : 능력치 8개 (근력, 건강, 크기, 민첩, 외모, 지능, 정신, 교육)
     color : 테마 색상 (R, G, B 숫자)
───────────────────────────────────────────────────────────────── */
const charData = [
    {
        id: 'p1',
        name: '가나다',
        title: 'A그룹',
        img: 'https://placehold.co/300x400/1a1a1a/888888?text=가나다',
        quote: '첫 번째 캐릭터의 대사를 여기에 입력하세요.',
        stats: '60,55,50,65,70,60,55,50',  /* 0~100 사이 숫자 8개 */
        color: '200, 200, 200',             /* 흰색 계열 테마 */
    },
    {
        id: 'p2',
        name: '다라마',
        title: 'A그룹',
        img: 'https://placehold.co/300x400/1a1a1a/888888?text=다라마',
        quote: '두 번째 캐릭터의 대사를 여기에 입력하세요.',
        stats: '50,60,55,70,60,75,60,65',
        color: '180, 180, 180',
    },
    {
        id: 'p3',
        name: '마바사',
        title: 'B그룹',
        img: 'https://placehold.co/300x400/1a1a1a/888888?text=마바사',
        quote: '세 번째 캐릭터의 대사를 여기에 입력하세요.',
        stats: '70,65,60,55,50,60,70,55',
        color: '160, 160, 160',
    },
    {
        id: 'p4',
        name: '사아자',
        title: 'B그룹',
        img: 'https://placehold.co/300x400/1a1a1a/888888?text=사아자',
        quote: '네 번째 캐릭터의 대사를 여기에 입력하세요.',
        stats: '55,50,65,60,75,55,65,70',
        color: '140, 140, 140',
    },
];


/* ─────────────────────────────────────────────────────────────────
   5. 상점 아이템 목록 (더미 데이터)
   ✏️  name: 아이템 이름 / desc: 설명 / price: 가격(G 단위) / type: 종류
   type 종류: 'item'(일반), 'furniture'(가구), 'wallpaper'(벽지), 'floor'(바닥재)
───────────────────────────────────────────────────────────────── */
const shopItems = [
    {
        name:  '샘플 아이템 A',
        desc:  '첫 번째 더미 아이템입니다. 설명을 이곳에 입력하세요.',
        price: 100,
        img:   'https://placehold.co/100x100/1a1a1a/aaaaaa?text=A',
        type:  'item'
    },
    {
        name:  '샘플 아이템 B',
        desc:  '두 번째 더미 아이템입니다.',
        price: 250,
        img:   'https://placehold.co/100x100/1a1a1a/aaaaaa?text=B',
        type:  'item'
    },
    {
        name:  '샘플 가구',
        desc:  '방에 배치할 수 있는 가구 아이템입니다.',
        price: 800,
        img:   'https://placehold.co/100x100/1a1a1a/aaaaaa?text=가구',
        type:  'furniture',
        width: 80,
        height: 80
    },
    {
        name:  '샘플 벽지',
        desc:  '방 벽지를 꾸밀 수 있습니다.',
        price: 500,
        img:   'https://placehold.co/100x100/1a1a1a/aaaaaa?text=벽지',
        type:  'wallpaper',
        colorL: '#2a2a2a',
        colorR: '#1a1a1a'
    },
];


/* ─────────────────────────────────────────────────────────────────
   6. 공유 런타임 상태 변수
   ⚠️  이 아래 변수들은 직접 수정하지 마세요.
   각 JS 파일의 함수를 통해서만 변경됩니다.
───────────────────────────────────────────────────────────────── */
let currentUser         = null;   /* 현재 로그인한 사용자 정보 */
let allProfiles         = [];     /* DB에서 불러온 전체 캐릭터 프로필 */
let currentEditingId    = null;   /* 현재 편집 중인 캐릭터 ID */
let currentEditingPhase = 0;      /* 현재 편집 중인 타임라인(0~3) */
let currentInvData      = [];     /* 인벤토리 편집 임시 저장 배열 */
let currentSlotIndex    = -1;     /* 선택된 인벤토리 칸 번호 */
let currentMailboxData  = [];     /* 우편함 임시 저장 배열 */
let currentHomeIdx      = 0;      /* 대문 슬라이더 현재 위치 */
let currentMoney        = 0;      /* 미니게임 소지금 임시 캐시 */

/* 갤러리 페이지네이션 설정 */
let currentGalleryPage       = 1;
const GALLERY_POSTS_PER_PAGE = 5; /* 한 페이지에 표시할 게시글 수 */

/* 레이더 차트 능력치 레이블 순서 */
const STAT_LABELS = ['근력', '건강', '크기', '민첩', '외모', '지능', '정신', '교육'];
