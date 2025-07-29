from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.quiz_db.quiz_db import Quiz
import uuid


quiz_data = [
    {
        "question_id": "Q1",
        "question": "At a party, you’re most likely to be:",
        "answers": [
            {"text": "The DJ controlling the music and energy"},
            {"text": "Deep in conversation with one fascinating person"},
            {"text": "The host making sure everyone’s having fun"},
            {"text": "Observing the social dynamics from a cozy corner"}
        ]
    },
    {
        "question_id": "Q2",
        "question": "Your ideal vacation is:",
        "answers": [
            {"text": "Backpacking through unexplored places with no set plans"},
            {"text": "A detailed itinerary hitting all the must-see spots"},
            {"text": "Somewhere you can help locals or volunteer"},
            {"text": "A peaceful retreat where you can think and recharge"}
        ]
    },
    {
        "question_id": "Q3",
        "question": "When making decisions, you:",
        "answers": [
            {"text": "Go with your gut immediately"},
            {"text": "Research every possible angle first"},
            {"text": "Consider how it affects everyone involved"},
            {"text": "Follow a logical system or framework"}
        ]
    },
    {
        "question_id": "Q4",
        "question": "Your friends describe you as:",
        "answers": [
            {"text": "The one who makes things happen"},
            {"text": "The one who keeps everyone grounded"},
            {"text": "The one who remembers everyone’s birthdays"},
            {"text": "The one with the most interesting ideas"}
        ]
    },
    {
        "question_id": "Q5",
        "question": "Under pressure, you:",
        "answers": [
            {"text": "Thrive and get energized by the challenge"},
            {"text": "Stay calm and work through it systematically"},
            {"text": "Rally everyone together as a team"},
            {"text": "Need quiet time to process and plan"}
        ]
    },
    {
        "question_id": "Q6",
        "question": "Your ideal work environment is:",
        "answers": [
            {"text": "Fast-paced with lots of variety and interaction"},
            {"text": "Stable with clear expectations and processes"},
            {"text": "Collaborative with opportunities to help others"},
            {"text": "Independent with time for deep thinking"}
        ]
    },
    {
        "question_id": "Q7",
        "question": "You’re most proud of:",
        "answers": [
            {"text": "Taking risks that paid off big"},
            {"text": "Building something lasting and reliable"},
            {"text": "Making a positive difference in someone’s life"},
            {"text": "Solving a complex problem others couldn’t"}
        ]
    },
    {
        "question_id": "Q8",
        "question": "Your secret superpower is:",
        "answers": [
            {"text": "Reading the room and knowing what people need"},
            {"text": "Seeing patterns others miss"},
            {"text": "Getting people excited about possibilities"},
            {"text": "Staying level-headed when everything’s chaos"}
        ]
    }
]


def seed_quiz_questions():
    db: Session = SessionLocal()

    for data in quiz_data:
        exists = db.query(Quiz).filter(Quiz.question_id == data["question_id"]).first()
        if not exists:
            new_quiz = Quiz(
                id=uuid.uuid4(),
                question_id=data["question_id"],
                question=data["question"],
                answers=data["answers"],
                #image="default.png"
            )
            db.add(new_quiz)

    db.commit()
    db.close()
    print("✅ Quiz questions seeded!")


if __name__ == "__main__":
    seed_quiz_questions()
