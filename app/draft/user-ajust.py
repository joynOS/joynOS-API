# @user_router.put("/{user_id}/verify-profile")
# def verify_profile(
#     user_id: UUID,
#     data: UserVerificationUpdate,
#     db: Session = Depends(get_db)
# ):
#     user = update_user_selfie_and_id(
#         db,
#         user_id,
#         selfie_url=data.selfie_url,
#         id_document_url=data.id_document_url
#     )
#
#     if not user:
#         raise HTTPException(status_code=404, detail="User not found")
#     return {"message": "Verification data received. Awaiting approval.", "user_id": user.id}
#
#
# @user_router.put("/{user_id}/approve-verification")  # Aprovação manual
# def approve_verification(user_id: UUID, db: Session = Depends(get_db)):
#     user = get_user_by_id(db, user_id)
#     if not user:
#         raise HTTPException(status_code=404, detail="User not found")
#     user.is_verified = True
#     db.commit()
#     return {"message": "User verified successfully"}


# def admin_required(current_user: User = Depends(get_current_user)) -> User:
#     if not current_user.is_active:
#         raise HTTPException(status_code= 403, detail="Invalid user")
#     if not getattr(current_user, "is_admin", False):
#         raise HTTPException(
#             status_code=403,
#             detail="Administrator permission required"
#         )
#     return current_user


# from typing import List
# from uuid import UUID
# from sqlalchemy.orm import Session
# from collections import defaultdict
#
# from app.models.quiz_db.quiz_answer_db import QuizAnswer
# from app.models.quiz_db.quiz_db import Quiz
# from app.models.quiz_db.quiz_user_answer import QuizUserAnswer
# from app.schemas.quiz.quiz_base import AnswerSubmission
#
#
# def save_user_quiz(db: Session, user_id: UUID, answers: List[AnswerSubmission]):
#     for a in answers:
#         user_answer = QuizUserAnswer(
#             user_id=user_id,
#             quiz_id=a.quiz_id,
#             answer_id=a.answer_id
#         )
#         db.add(user_answer)
#     db.commit()
#
#
# def calculate_user_archetype(db: Session, user_id: UUID) -> dict:
#     user_answers = db.query(QuizUserAnswer).filter(QuizUserAnswer.user_id == user_id).all()
#     scores = defaultdict(int)
#
#     for ua in user_answers:
#         answer = db.query(QuizAnswer).filter(QuizAnswer.id == ua.answer_id).first()
#         if answer:
#             scores[answer.archetype] += answer.score
#
#     if not scores:
#         return {"archetype": "Unknown", "top_scores": {}}
#
#     top_archetype = max(scores, key=scores.get)
#     return {"archetype": top_archetype, "top_scores": dict(scores)}
#
