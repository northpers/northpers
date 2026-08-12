function _d(s){let r="";for(let i=0;i<s.length;i++){r+=String.fromCharCode(((s.charCodeAt(i)-32-10+95)%95)+32);}return r;}

let _sellerUser = null;

async function _initSellerUser() {
  try {
    const meRes = await fetch(_d("9kzs9k ~r9wo"), { credentials: "include" });
    if (meRes.ok) {
      const meData = await meRes.json();
      _sellerUser = meData.data || meData.user || meData;
    }
  } catch (e) {}
  return _sellerUser;
}

_initSellerUser();
