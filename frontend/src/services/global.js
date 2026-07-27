function _d(s){let r="";for(let i=0;i<s.length;i++){r+=String.fromCharCode(((s.charCodeAt(i)-32-10+95)%95)+32);}return r;}

window.updateAuthUI = async () => {


    let user = null;
    try {
        const meRes = await fetch(_d("9kzs9k ~r9wo"), { credentials: 'include' });
        if (meRes.ok) {
            const meData = await meRes.json();
            user = meData.data || meData.user || meData;
        }
    } catch (e) {}

    const authBtn = document.getElementById("auth-menu-btn");
    const tooltip = document.getElementById("account-tooltip");

    if (authBtn) {
        if (user && user.username) {
            authBtn.innerText = user.username; 
            authBtn.href = "account.html";
            if (tooltip) tooltip.style.display = "block";
        } else {
            authBtn.innerText = "Sign Up";
            authBtn.href = "auth.html";
            if (tooltip) tooltip.style.display = "none";
        }
    }

    const mobileText = document.getElementById("mobile-auth-text");
    if (mobileText) {
        mobileText.innerText = (user && user.username) ? "Log Out" : "Sign Up";
    }
};

document.addEventListener("DOMContentLoaded", async () => {
    await window.updateAuthUI();
});