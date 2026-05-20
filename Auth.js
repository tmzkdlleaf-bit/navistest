/* ================================================================= */
/* Auth.js — 인증 & DB 공통 유틸                                      */
/* ================================================================= */

/* ─────────────────────────────────────────────────────────────────
   1. 로그인 / 회원가입 / 로그아웃
───────────────────────────────────────────────────────────────── */
window.handleLogin = async function () {
    var email    = document.getElementById('auth-email').value;
    var password = document.getElementById('auth-password').value;

    var result = await supabaseClient.auth.signInWithPassword({
        email:    email,
        password: password
    });

    if (result.error) {
        alert('로그인 실패: ' + result.error.message);
    } else {
        location.reload();
    }
};

window.handleSignUp = async function () {
    var email    = document.getElementById('auth-email').value;
    var password = document.getElementById('auth-password').value;

    var result = await supabaseClient.auth.signUp({
        email:    email,
        password: password
    });

    if (result.error) {
        alert('가입 실패: ' + result.error.message);
    } else {
        alert('가입 완료! 이메일을 확인하거나 로그인 해주세요.');
        closeModal('auth-modal');
    }
};

window.signOut = async function () {
    await supabaseClient.auth.signOut();
    location.reload();
};

window.openAuthModal = function () {
    var modal = document.getElementById('auth-modal');
    if (modal) modal.classList.add('show');
};

/* ─────────────────────────────────────────────────────────────────
   2. 로그인 상태 확인 & 편집 버튼 자동 주입
───────────────────────────────────────────────────────────────── */
async function checkLoginState() {
    if (!supabaseClient) return;

    var user = null;
    try {
        var res  = await supabaseClient.auth.getUser();
        user     = (res.data && res.data.user) ? res.data.user : null;
    } catch (e) {
        console.warn('사용자 정보 가져오기 실패:', e);
        return;
    }

    currentUser = user;

    var loginBtn  = document.getElementById('login-btn');
    var logoutBtn = document.getElementById('logout-btn');

    if (!user) return;

    if (loginBtn)  loginBtn.style.display  = 'none';
    if (logoutBtn) logoutBtn.style.display = 'inline-block';

    if (adminEmails.includes(user.email)) {
        document.querySelectorAll('.money-row').forEach(function (row) {
            row.classList.add('editable-area');
            row.onclick = function () {
                var charId     = row.closest('.content-card') ? row.closest('.content-card').id : null;
                var slide      = row.closest('.phase-slide');
                var phaseIndex = slide ? Array.from(slide.parentNode.children).indexOf(slide) : 0;
                if (typeof window.openMoneyModal === 'function') {
                    window.openMoneyModal(charId, phaseIndex);
                }
            };
        });
    }

    var myCharId = charOwners[user.email];
    if (!myCharId) return;

    var section = document.getElementById(myCharId);
    if (!section) return;

    var base = charData.find(function (c) {
        return c.id === myCharId.replace('char-', '');
    });

    section.querySelectorAll('.char-quote').forEach(function (quoteEl, i) {
        if (quoteEl.querySelector('.edit-icon-btn')) return;
        var btn        = document.createElement('button');
        btn.className  = 'edit-icon-btn';
        btn.innerHTML  = '&#9998;';
        btn.title      = '한마디 편집';
        btn.onclick    = function () { openGeneralModal(myCharId, i); };
        if (base) btn.style.backgroundColor = 'rgb(' + base.color + ')';
        quoteEl.appendChild(btn);
    });

    section.querySelectorAll('.radar-chart').forEach(function (chartEl, i) {
        chartEl.classList.add('editable-area');
        chartEl.title   = '능력치 편집';
        chartEl.onclick = function () { openStatsModal(myCharId, i); };
    });

    section.querySelectorAll('.weapon-display-wrapper').forEach(function (wpnEl, i) {
        wpnEl.classList.add('editable-area');
        wpnEl.title   = '무기 편집';
        wpnEl.onclick = function () { openWeaponModal(myCharId, i); };
    });

    section.querySelectorAll('.rpg-inventory').forEach(function (invEl, i) {
        invEl.classList.add('editable-area');
        invEl.title   = '인벤토리 편집';
        invEl.onclick = function () { openInvModal(myCharId, i); };

        var headerWrap = invEl.previousElementSibling;
        if (headerWrap && headerWrap.classList.contains('inv-header-wrapper') && !headerWrap.querySelector('.open-mailbox-btn')) {
            var mailBtn       = document.createElement('button');
            mailBtn.className = 'open-mailbox-btn';
            mailBtn.textContent = '우편함 열기';
            mailBtn.onclick   = function (e) {
                e.stopPropagation();
                openMailboxModal(myCharId, i);
            };
            headerWrap.appendChild(mailBtn);
        }
    });
}

/* ─────────────────────────────────────────────────────────────────
   3. DB 저장 및 불러오기
───────────────────────────────────────────────────────────────── */
async function upsertProfileData(updates) {
    if (!supabaseClient || !currentEditingId) {
        return { error: 'supabaseClient 또는 currentEditingId 없음' };
    }

    try {
        var selectResult = await supabaseClient
            .from('character_profiles')
            .select('char_id')
            .eq('char_id', currentEditingId)
            .eq('phase',   currentEditingPhase);

        if (selectResult.data && selectResult.data.length > 0) {
            return await supabaseClient
                .from('character_profiles')
                .update(updates)
                .eq('char_id', currentEditingId)
                .eq('phase',   currentEditingPhase);
        } else {
            var newRow = Object.assign({}, updates, {
                char_id: currentEditingId,
                phase:   currentEditingPhase
            });
            return await supabaseClient
                .from('character_profiles')
                .insert([newRow]);
        }
    } catch (e) {
        console.error('upsertProfileData 오류:', e);
        return { error: e };
    }
}

async function loadCharacterData() {
    if (!supabaseClient) return;

    var fetched;
    try {
        fetched = await supabaseClient.from('character_profiles').select('*');
    } catch (e) {
        console.error('loadCharacterData fetch 오류:', e);
        return;
    }
    if (fetched.error) {
        console.error('loadCharacterData DB 오류:', fetched.error);
        return;
    }

    allProfiles = fetched.data || [];

    allProfiles.forEach(function (profile) {
        var section = document.getElementById(profile.char_id);
        if (!section) return;

        var phaseIdx    = profile.phase || 0;
        var targetSlide = section.querySelectorAll('.phase-slide')[phaseIdx];
        if (!targetSlide) return;

        var profImg = targetSlide.querySelector('.main-profile-img');
        if (profImg && profile.profile_image) profImg.src = profile.profile_image;

        var quoteTxt = targetSlide.querySelector('.quote-text');
        if (quoteTxt && profile.quote) quoteTxt.innerText = profile.quote;

        var infoValues = targetSlide.querySelectorAll('.info-value');
        if (infoValues.length >= 4) {
            infoValues[1].innerText = profile.job       || '?';
            infoValues[2].innerText = profile.age       || '?';
            infoValues[3].innerText = profile.residence || '?';
        }

        var introEl = targetSlide.querySelector('.section-intro');
        if (introEl && profile.backstory) introEl.innerText = profile.backstory;

        var statsWrapper = targetSlide.querySelector('.stats-wrapper');
        if (statsWrapper) {
            if (profile.stats)       statsWrapper.setAttribute('data-stats', profile.stats);
            if (profile.chart_color) statsWrapper.setAttribute('data-color', profile.chart_color);
        }

        var moneyDisplay = targetSlide.querySelector('.money-display');
        if (moneyDisplay) {
            var moneyNum = profile.money ? parseInt(profile.money) : 0;
            moneyDisplay.innerText = moneyNum.toLocaleString() + ' G';
        }

        var wpnWrapper = targetSlide.querySelector('.weapon-display-wrapper');
        if (wpnWrapper) {
            var rawWeaponData = profile.weapon_data || '{}';
            wpnWrapper.setAttribute('data-weapon', rawWeaponData);
            
            var parsed = { brawl: 25, weapons: [] };
            try {
                var tmp    = JSON.parse(rawWeaponData);
                parsed.brawl   = tmp.brawl   || 25;
                parsed.weapons = tmp.weapons  || [];
            } catch (e) {}

            var brawlEl = wpnWrapper.querySelector('.wpn-brawl-display');
            if (brawlEl) brawlEl.innerText = 'Brawl: ' + parsed.brawl;

            var weaponListEl = wpnWrapper.querySelector('.weapon-content-list');
            if (weaponListEl) {
                if (!parsed.weapons.length) {
                    weaponListEl.innerHTML = '<div style="background:rgba(255,255,255,0.02); padding:10px; border-radius:8px; text-align:center; color:#555; font-size:0.9rem;">No weapons equipped.</div>';
                } else {
                    weaponListEl.innerHTML = parsed.weapons.map(function (w) {
                        return '<div style="background:rgba(255,255,255,0.02); padding:10px; border-radius:8px; border:1px solid rgba(255,255,255,0.05); text-align:left; margin-bottom:6px;">' +
                            '<div style="display:flex; justify-content:space-between; margin-bottom:4px;"><strong style="color:#aaa;">' + w.name + '</strong><span style="color:#888; font-size:0.85rem;">[' + w.dmg + ']</span></div>' +
                            '<div style="color:#555; font-size:0.82rem;">' + (w.desc || '') + '</div></div>';
                    }).join('');
                }
            }
        }
    });

    setTimeout(function () {
        if (typeof window.drawAllRadarCharts === 'function') window.drawAllRadarCharts();
    }, 100);
}

/* ─────────────────────────────────────────────────────────────────
   5. 이미지 업로드 & 유틸
───────────────────────────────────────────────────────────────── */
async function uploadToImgbb(file) {
    var formData = new FormData();
    formData.append('image', file);
    try {
        var response = await fetch('https://api.imgbb.com/1/upload?key=' + IMGBB_API_KEY, { method: 'POST', body: formData });
        var result = await response.json();
        return result.success ? result.data.url : null;
    } catch (e) {
        console.error('imgbb 업로드 실패:', e);
        return null;
    }
}

function hexToRgb(hex) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return r + ', ' + g + ', ' + b;
}

function rgbToHex(rgbStr) {
    var parts = rgbStr.split(',').map(function (x) { return parseInt(x.trim()); });
    return '#' + (1 << 24 | parts[0] << 16 | parts[1] << 8 | parts[2]).toString(16).slice(1);
}
