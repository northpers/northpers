import os
import json
import cv2
import numpy as np
from insightface.app import FaceAnalysis

UPLOAD_DIR = "/home/hostinesia/northline/backend/uploads/npinjam"

face_app = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider'])
face_app.prepare(ctx_id=0, det_size=(640, 640))

SIMILARITY_THRESHOLD = 0.5

def verify_faces(ktp_path, selfie_path):
    """Bandingkan wajah pada foto KTP dengan wajah pada selfie.

    Output selalu punya tiga kunci: available, success, score.

    available  False hanya kalau mesinnya sendiri yang rusak. Node memakai
              nilai ini untuk membedakan "wajahnya memang tidak cocok" dari
              "verifikasi tidak bisa dijalankan", karena keduanya sebelumnya
              sama-sama muncul sebagai success=False, score=0.0 dan membuat
              user jadi ikut ditolak dengan pesan yang menyesatkan.
    success    Hanya True kalau kedua gambar terbaca, wajah terdeteksi di
              keduanya, dan similarity >= SIMILARITY_THRESHOLD.
    score      Similarity cosine, atau None kalau tidak ada yang bisa dinilai.
              Tidak pernah 0.0 sebagai penanda gagal - 0.0 itu nilai valid
              untuk "kemiripan nol".
    """
    try:
        ktp_img = cv2.imread(ktp_path)
        selfie_img = cv2.imread(selfie_path)

        if ktp_img is None or selfie_img is None:
            return {"available": True, "success": False, "score": None,
                    "message": "Gagal memuat foto untuk verifikasi"}

        ktp_faces = face_app.get(ktp_img)
        selfie_faces = face_app.get(selfie_img)

        if len(ktp_faces) == 0:
            return {"available": True, "success": False, "score": None,
                    "message": "Tidak ada wajah terdeteksi di foto KTP"}
        if len(selfie_faces) == 0:
            return {"available": True, "success": False, "score": None,
                    "message": "Tidak ada wajah terdeteksi di foto selfie"}

        ktp_emb = ktp_faces[0].embedding
        selfie_emb = selfie_faces[0].embedding

        similarity = float(np.dot(ktp_emb, selfie_emb) / (np.linalg.norm(ktp_emb) * np.linalg.norm(selfie_emb)))

        if similarity >= SIMILARITY_THRESHOLD:
            return {"available": True, "success": True, "score": round(similarity, 4),
                    "message": "Wajah cocok dengan KTP"}
        else:
            return {"available": True, "success": False, "score": round(similarity, 4),
                    "message": f"Wajah di selfie tidak cocok dengan foto KTP (similarity: {similarity:.2f}). Pastikan wajah terlihat jelas dan pencahayaan cukup."}
    except Exception as e:
        # Mesin's problem, bukan user's. available=False supaya request tidak
        # ditolak; Node menandai pengajuan untuk review manual.
        return {"available": False, "success": False, "score": None,
                "message": f"Verifikasi wajah tidak tersedia: {str(e)}"}

if __name__ == "__main__":
    import sys
    if len(sys.argv) >= 3:
        result = verify_faces(sys.argv[1], sys.argv[2])
        print(json.dumps(result))
    else:
        print("Face verify service ready")