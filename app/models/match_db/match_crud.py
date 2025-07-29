from sentence_transformers import SentenceTransformer
import numpy as np

from sqlalchemy.orm import Session
from uuid import UUID
from app.models.match_db.match_db import Match
from typing import List


model = SentenceTransformer("all-MiniLM-L6-v2")  # rápido e leve


def embed_quiz_answers(answers: list[str]) -> np.ndarray:
    if len(answers) != 8:
        raise ValueError("A lista deve conter exatamente 8 respostas.")

    embeddings = model.encode(answers, convert_to_numpy=True)
    combined_embedding = np.mean(embeddings, axis=0)
    return combined_embedding


def save_user_embedding(user_id: UUID, embedding: List[float], answers: List[str], db: Session):
    existing = db.query(Match).filter(Match.user_id == user_id).first()

    if existing:
        existing.embedding = embedding
        existing.answers = answers
    else:
        new_entry = Match(user_id=user_id, embedding=embedding, answers=answers)
        db.add(new_entry)

    db.commit()


def compute_match(user1_answers, user2_answers):
    score = 0

    raw_weights = {
        0: 0.20,  # Q1 - Social Energy
        1: 0.10,  # Q2 - Adventure/Planning
        2: 0.15,  # Q3 - Decision Making
        3: 0.30,  # Q4 - Friend Role (Core Values)
        4: 0.25,  # Q5 - Pressure Response
        5: 0.15,  # Q6 - Work Environment
        6: 0.15,  # Q7 - What you’re proud of (Values/Drive)
        7: 0.10   # Q8 - Secret Superpower (Strength Style)
    }

    total_weight = sum(raw_weights.values())
    weights = {k: v / total_weight for k, v in raw_weights.items()}

    # === Q1: Social Energy ===
    def social_energy_match(a1, a2):
        high = {"The DJ controlling the music and energy", "The host making sure everyone’s having fun"}
        low = {"Deep in conversation with one fascinating person", "Observing the social dynamics from a cozy corner"}

        if a1 in high and a2 in high:
            return 85
        elif a1 in low and a2 in low:
            return 90
        elif (a1 in high and a2 in low) or (a1 in low and a2 in high):
            return 50
        else:
            return 70  # one high, one mid

    # === Q2: Adventure/Planning ===
    def adventure_match(a1, a2):
        planners = {"A detailed itinerary hitting all the must-see spots"}
        spontaneous = {"Backpacking through unexplored places with no set plans"}
        moderate = {"Somewhere you can help locals or volunteer", "A peaceful retreat where you can think and recharge"}

        if (a1 in planners and a2 in spontaneous) or (a1 in spontaneous and a2 in planners):
            return 95
        elif a1 in moderate and a2 in moderate:
            return 75
        elif (a1 in planners and a2 in planners) or (a1 in spontaneous and a2 in spontaneous):
            return 75
        else:
            return 60

    # === Q3: Decision Making ===
    def decision_match(a1, a2):
        gut = "Go with your gut immediately"
        research = "Research every possible angle first"
        people = "Consider how it affects everyone involved"
        logic = "Follow a logical system or framework"

        if (a1 == gut and a2 == research) or (a1 == research and a2 == gut):
            return 90
        elif (a1 == people and a2 == logic) or (a1 == logic and a2 == people):
            return 80
        elif a1 == a2:
            return 70
        else:
            return 65

    # === Q4: Friend Role / Core Values ===
    def values_match(a1, a2):
        if a1 == a2:
            return 95
        elif (
            (a1 == "The one who makes things happen" and a2 == "The one who keeps everyone grounded") or
            (a2 == "The one who makes things happen" and a1 == "The one who keeps everyone grounded") or
            (a1 == "The one who remembers everyone’s birthdays" and a2 == "The one who keeps everyone grounded") or
            (a2 == "The one who remembers everyone’s birthdays" and a1 == "The one who keeps everyone grounded") or
            (a1 == "The one with the most interesting ideas" and a2 == "The one who makes things happen") or
            (a2 == "The one with the most interesting ideas" and a1 == "The one who makes things happen")
        ):
            return 85
        else:
            return 40

    # === Q5: Pressure Response ===
    def pressure_match(a1, a2):
        if (a1 == "Thrive and get energized by the challenge" and a2 == "Stay calm and work through it systematically") or \
           (a2 == "Thrive and get energized by the challenge" and a1 == "Stay calm and work through it systematically"):
            return 90
        elif a1 == a2:
            return 75
        elif (a1 == "Rally everyone together as a team" and a2 == "Need quiet time to process and plan") or \
             (a2 == "Rally everyone together as a team" and a1 == "Need quiet time to process and plan"):
            return 60
        else:
            return 70

    # === Q6: Work Environment ===
    def work_match(a1, a2):
        compatibility = {
            "Fast-paced with lots of variety and interaction": {"Stable with clear expectations and processes", "Collaborative with opportunities to help others"},
            "Stable with clear expectations and processes": {"Collaborative with opportunities to help others", "Independent with time for deep thinking"},
            "Collaborative with opportunities to help others": {"Fast-paced with lots of variety and interaction", "Stable with clear expectations and processes"},
            "Independent with time for deep thinking": {"Collaborative with opportunities to help others", "Stable with clear expectations and processes"},
        }

        if a1 == a2:
            return 85
        elif a2 in compatibility.get(a1, {}):
            return 70
        else:
            return 45

    # === Q7: Pride (Values/Drive) ===
    def pride_match(a1, a2):
        if a1 == a2:
            return 90
        elif (
            (a1 == "Taking risks that paid off big" and a2 == "Solving a complex problem others couldn’t") or
            (a1 == "Making a positive difference in someone’s life" and a2 == "Solving a complex problem others couldn’t") or
            (a1 == "Making a positive difference in someone’s life" and a2 == "Building something lasting and reliable")
        ):
            return 80
        else:
            return 60

    # === Q8: Superpower (Strength Style) ===
    def superpower_match(a1, a2):
        if a1 == a2:
            return 90
        elif (
            (a1 == "Reading the room and knowing what people need" and a2 == "Getting people excited about possibilities") or
            (a1 == "Staying level-headed when everything’s chaos" and a2 == "Seeing patterns others miss")
        ):
            return 80
        else:
            return 65

    # Apply matching
    match_functions = [
        social_energy_match,
        adventure_match,
        decision_match,
        values_match,
        pressure_match,
        work_match,
        pride_match,
        superpower_match
    ]

    for i, func in enumerate(match_functions):
        pair_score = func(user1_answers[i], user2_answers[i])
        score += pair_score * weights[i]

    # === BOOSTS ===
    helping_values = {"Somewhere you can help locals or volunteer", "Making a positive difference in someone’s life"}
    creativity_answers = {
        "Getting people excited about possibilities",
        "The one with the most interesting ideas",
        "Backpacking through unexplored places with no set plans",
        "Solving a complex problem others couldn’t"
    }

    # +10% boost if both have at least one "help others" answer
    if any(ans in helping_values for ans in user1_answers) and any(ans in helping_values for ans in user2_answers):
        score *= 1.10

    # +5% boost if both chose at least one creative/unconventional answer
    if any(ans in creativity_answers for ans in user1_answers) and any(ans in creativity_answers for ans in user2_answers):
        score *= 1.05

    # -5% penalty if pressure responses are directly conflicting
    pr1 = user1_answers[4]
    pr2 = user2_answers[4]
    if (pr1 == "Rally everyone together as a team" and pr2 == "Need quiet time to process and plan") or \
       (pr2 == "Rally everyone together as a team" and pr1 == "Need quiet time to process and plan"):
        score *= 0.95

    return round(min(score, 100), 2)
