# ???뿺 ??곸젫 ?癒?젟 ??뺥돩??
from typing import Literal, Optional

from sqlalchemy.orm import Session

from backend.spec_loop.models import MissionResult, MissionTemplate, MicroAction, Place


MissionCombinationMode = Literal["strict", "basic", "flexible"]


def check_alarm_dismissal(
    db: Session,
    day_id: int,
    combination_mode: MissionCombinationMode = "basic",
) -> dict:
    """
    沃섎챷??鈺곌퀬鍮 筌뤴뫀諭???怨뺤뵬 ???뿺 ??곸젫 揶쎛????? ?癒?젟

    Args:
        db: DB ?紐꾨?
        day_id: DayPlan ID
        combination_mode: 沃섎챷??鈺곌퀬鍮 筌뤴뫀諭?

    Returns:
        dict: {
            "can_dismiss": bool,
            "mode": str,
            "total_missions": int,
            "passed_missions": int,
            "failed_missions": int,
            "reason": str
        }
    """
    # ????DayPlan??沃섎챷??野껉퀗??鈺곌퀬??
    mission_results = (
        db.query(MissionResult)
        .filter(MissionResult.day_id == day_id)
        .order_by(MissionResult.attempted_at.desc())
        .all()
    )

    if not mission_results:
        return {
            "can_dismiss": False,
            "mode": combination_mode,
            "total_missions": 0,
            "passed_missions": 0,
            "failed_missions": 0,
            "reason": "?袁⑹춦 沃섎챷?????묐뻬??? ??녿릭??щ빍??",
        }

    passed_results = [r for r in mission_results if r.passed]
    failed_results = [r for r in mission_results if not r.passed]

    # 沃섎챷??????낇??브쑬履?
    photo_results = [r for r in mission_results if r.mission_type == "photo"]
    photo_passed = [r for r in photo_results if r.passed]

    # 鈺곌퀬鍮 筌뤴뫀諭띈퉪??癒?젟
    can_dismiss = False
    reason = ""

    if combination_mode == "strict":
        # 筌뤴뫀諭?沃섎챷?????궢 ?袁⑹뒄
        can_dismiss = len(passed_results) == len(mission_results)
        if can_dismiss:
            reason = f"筌뤴뫀諭?沃섎챷?????궢! ({len(passed_results)}/{len(mission_results)})"
        else:
            reason = f"筌뤴뫀諭?沃섎챷??????궢??뤿선????몃빍?? ({len(passed_results)}/{len(mission_results)})"

    elif combination_mode == "basic":
        # ??彛?沃섎챷?∽쭕????궢??롢늺 OK (??곸몵筌?1揶???곴맒)
        if photo_results:
            can_dismiss = len(photo_passed) == len(photo_results)
            reason = (
                "??彛?沃섎챷?????궢!"
                if can_dismiss
                else f"??彛?沃섎챷??????궢??곷튊 ??몃빍?? ({len(photo_passed)}/{len(photo_results)})"
            )
        else:
            can_dismiss = len(passed_results) >= 1
            reason = (
                "沃섎챷?????궢!"
                if can_dismiss
                else "筌ㅼ뮇??1揶?沃섎챷??????궢??곷튊 ??몃빍??"
            )

    elif combination_mode == "flexible":
        # ?袁ⓓ?1揶쏆뮆彛????궢
        can_dismiss = len(passed_results) >= 1
        reason = (
            f"沃섎챷?????궢! ({len(passed_results)}揶?"
            if can_dismiss
            else "筌ㅼ뮇??1揶?沃섎챷??????궢??곷튊 ??몃빍??"
        )

    return {
        "can_dismiss": can_dismiss,
        "mode": combination_mode,
        "total_missions": len(mission_results),
        "passed_missions": len(passed_results),
        "failed_missions": len(failed_results),
        "reason": reason,
    }


def dismiss_alarm_and_update_stats(
    db: Session,
    day_id: int,
    user_id: Optional[str] = None,
) -> dict:
    """
    ???뿺 ??곸젫 獄???????낅쑓??꾨뱜

    沃섎챷??野껉퀗?든몴?疫꿸퀡而??곗쨮:
    - MicroAction.success_count ??낅쑓??꾨뱜
    - MissionTemplate.success_count ??낅쑓??꾨뱜
    - Place.success_count ??낅쑓??꾨뱜

    Returns:
        dict: ??낅쑓??꾨뱜 野껉퀗??
    """
    mission_results = (
        db.query(MissionResult).filter(MissionResult.day_id == day_id).all()
    )

    updated_stats = {
        "micro_actions": 0,
        "mission_templates": 0,
        "places": 0,
    }

    for result in mission_results:
        # MissionTemplate ??????낅쑓??꾨뱜
        if result.mission_template_id:
            template = (
                db.query(MissionTemplate)
                .filter(MissionTemplate.mission_template_id == result.mission_template_id)
                .first()
            )
            if template:
                template.total_count += 1
                if result.passed:
                    template.success_count += 1
                template.last_result = "success" if result.passed else "fail"
                updated_stats["mission_templates"] += 1

        # Place ??????낅쑓??꾨뱜 (location 沃섎챷???野껋럩??
        if result.mission_type == "location" and result.evidence:
            place_id = result.evidence.get("place_id")
            if place_id:
                place = db.query(Place).filter(Place.place_id == place_id).first()
                if place:
                    place.total_count += 1
                    if result.passed:
                        place.success_count += 1
                    updated_stats["places"] += 1

    # MicroAction ??????낅쑓??꾨뱜
    # TODO: DayPlan?癒?퐣 micro_action_id ?곕뗄???뤿연 ??낅쑓??꾨뱜

    db.commit()

    return {
        "dismissed": True,
        "updated_stats": updated_stats,
    }

