"""
spec_loop ê°ë°???ë ?¤í¬ë¦½í¸

?¤í ??
  cd backend
  python seed_spec_loop_dev.py

ê¸°ë¥:
- Taskê° ?ë???ì¼ë©?ê¸°ë³¸ Task ëª?ê°??ì±
- DayPlan???ë???ì¼ë©??¤ë ?ì§ ê¸°ì? DayPlan 1ê°??ì±
  (mode=100, ?ì??ë§ë Task?¤ì itemsë¡??¬í¨)
"""

from datetime import date

from backend.database import Base, SessionLocal, engine
from backend.spec_loop.models import Task, DayPlan


def seed_tasks(session):
  """Task ?ì´ë¸ì´ ë¹ì´ ?ì¼ë©?ê¸°ë³¸ Task 3ê°??ì±."""
  existing = session.query(Task).count()
  if existing > 0:
      return

  defaults = [
      Task(
          title="ì§ì¤ ?ì ë¸ë¡",
          est_minutes=60,
          priority=1,
          tags=["deep_work"],
          energy_cost=4,
          pain_sensitive=False,
          requires_focus=True,
      ),
      Task(
          title="?ë¦¬/ê´ë¦??ì",
          est_minutes=30,
          priority=2,
          tags=["admin"],
          energy_cost=2,
          pain_sensitive=False,
          requires_focus=False,
      ),
      Task(
          title="ê°ë²¼ì´ ì¤ë¹??ì",
          est_minutes=20,
          priority=3,
          tags=["prep"],
          energy_cost=1,
          pain_sensitive=False,
          requires_focus=False,
      ),
  ]
  session.add_all(defaults)
  session.commit()
  print(f"[seed] Created {len(defaults)} default Task rows.")


def seed_day_plan(session):
  """DayPlan???ì¼ë©??¤ë ?ì§ ê¸°ì? DayPlan 1ê°??ì±."""
  existing = session.query(DayPlan).count()
  if existing > 0:
      return

  tasks = session.query(Task).order_by(Task.task_id.asc()).all()
  if not tasks:
      print("[seed] No tasks found, skipping DayPlan seed.")
      return

  items = []
  for idx, t in enumerate(tasks):
      items.append(
          {
              "item_id": f"seed-{idx+1}",
              "task_id": t.task_id,
              "planned_block_minutes": t.est_minutes,
              "micro_steps": ["ì²?2ë¶?ì°©ì", f"{t.title} ?ì ì¤ë¹?],
          }
      )

  dp = DayPlan(
      user_id=None,
      date=date.today(),
      mode=100,
      items=items,
      protected_block_minutes=None,
  )
  session.add(dp)
  session.commit()
  print(f"[seed] Created DayPlan day_id={dp.day_id} with {len(items)} items.")


def main():
  # ?ì´ë¸??ì± (?´ë? ?ì¼ë©?noop)
  Base.metadata.create_all(bind=engine)

  db = SessionLocal()
  try:
      seed_tasks(db)
      seed_day_plan(db)
  finally:
      db.close()


if __name__ == "__main__":
  main()



