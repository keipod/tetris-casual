#!/usr/bin/env python3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import engine  # noqa: E402

P0, P1 = "alice", "bob"


def shot(state, zone=0, power=60):
    engine.apply_action(state, state["kicker"], {"type": "shot", "zone": zone, "power": power})


def dive(state, zone=3):
    engine.apply_action(state, state["keeper"], {"type": "dive", "zone": zone})


def result_of(events):
    return next(e for e in events if e["type"] == "kick_result")


def test_same_zone_is_save():
    st = engine.new_match(P0, P1)
    shot(st, zone=2, power=50)
    dive(st, zone=2)
    r = result_of(engine.drain_events(st))
    assert r["outcome"] == "save", r
    assert st["taken"][P0] == 1 and st["goals"][P0] == 0


def test_far_zone_low_power_goal():
    st = engine.new_match(P0, P1)
    shot(st, zone=0, power=40)
    dive(st, zone=2)
    r = result_of(engine.drain_events(st))
    assert r["outcome"] == "goal", r


def test_overpowered_is_out():
    st = engine.new_match(P0, P1)
    shot(st, zone=4, power=97)
    dive(st, zone=4)
    r = result_of(engine.drain_events(st))
    assert r["outcome"] == "out", r


def test_adjacent_row_resolution_deterministic():
    outcomes = set()
    for i in range(24):
        st = engine.new_match(f"a{i}", f"b{i}")
        shot(st, zone=1, power=50)
        dive(st, zone=0)
        outcomes.add(result_of(engine.drain_events(st))["outcome"])
    assert outcomes <= {"save", "goal"}, outcomes
    assert len(outcomes) == 2, f"expected both branches over repeats: {outcomes}"


def test_view_hides_opponent_lock():
    st = engine.new_match(P0, P1)
    shot(st, zone=5, power=80)
    v_kicker = engine.view_for(st, P0)
    v_keeper = engine.view_for(st, P1)
    assert v_kicker["pendingDive"] is None and v_kicker["pendingShot"] is None
    assert v_keeper["pendingShot"] is None and v_keeper["pendingDive"] is None
    assert v_kicker["myLock"] == {"kind": "shot"}
    assert v_keeper["myLock"] == {"kind": "dive"}


def test_illegal_actions_raise():
    st = engine.new_match(P0, P1)
    for bad in (
        lambda: engine.apply_action(st, P1, {"type": "shot", "zone": 0, "power": 10}),
        lambda: engine.apply_action(st, P0, {"type": "dive", "zone": 0}),
        lambda: engine.apply_action(st, P0, {"type": "shot", "zone": 9, "power": 10}),
        lambda: engine.apply_action(st, P0, {"type": "shot", "zone": 0, "power": 0}),
        lambda: engine.apply_action(st, P0, {"type": "shot", "zone": 0, "power": 101}),
        lambda: shot(st),
        lambda: shot(st),
        lambda: engine.apply_action(st, P0, {"type": "teleport"}),
    ):
        try:
            bad()
            raise AssertionError("expected ValueError")
        except ValueError:
            pass


def test_full_match_with_sudden_death():
    st = engine.new_match(P0, P1)
    plan = {
        (P0, "k"): (4, 70), (P1, "d"): 4,
        (P1, "k"): (4, 70), (P0, "d"): 0,
        (P0, "k"): (0, 30), (P1, "d"): 2,
        (P1, "k"): (2, 90), (P0, "d"): 5,
        (P0, "k"): (3, 55), (P1, "d"): 0,
        (P1, "k"): (5, 65), (P0, "d"): 5,
    }
    kicks = 0
    while st["phase"] != "ended" and kicks < 40:
        if not st["pendingShot"]:
            z, p = plan[(st["kicker"], "k")]
            engine.apply_action(st, st["kicker"], {"type": "shot", "zone": z, "power": p})
        else:
            engine.apply_action(st, st["keeper"], {"type": "dive", "zone": plan[(st["keeper"], "d")]})
        engine.drain_events(st)
        kicks += 1
    assert st["phase"] == "ended"
    assert st["winner"] in (P0, P1)
    assert st["goals"][st["winner"]] > st["goals"][P1 if st["winner"] == P0 else P0]


def test_early_finish_when_mathematically_decided():
    st = engine.new_match(P0, P1)
    pairs = [
        (("shot", 0, 80), ("dive", 2)),
        (("shot", 0, 80), ("dive", 0)),
        (("shot", 2, 80), ("dive", 4)),
        (("shot", 1, 80), ("dive", 1)),
        (("shot", 3, 80), ("dive", 5)),
        (("shot", 2, 97), ("dive", 0)),
    ]
    for kicker_act, keeper_act in pairs:
        engine.apply_action(st, st["kicker"], {"type": kicker_act[0], "zone": kicker_act[1], "power": kicker_act[2]})
        engine.apply_action(st, st["keeper"], {"type": keeper_act[0], "zone": keeper_act[1]})
        engine.drain_events(st)
        if st["phase"] == "ended":
            break
    assert st["phase"] == "ended", "should end early once lead exceeds remaining kicks"
    assert st["winner"] == P0
    assert st["goals"] == {P0: 3, P1: 0}, st["goals"]
    assert st["taken"] == {P0: 3, P1: 3}, st["taken"]


def test_forfeit():
    st = engine.new_match(P0, P1)
    engine.forfeit(st, P1)
    assert st["phase"] == "ended" and st["winner"] == P0
    try:
        shot(st)
        raise AssertionError("post-forfeit action must fail")
    except ValueError:
        pass


def test_cpu_always_legal():
    st = engine.new_match("cpu", P1)
    for _ in range(12):
        if st["phase"] == "ended":
            break
        act = engine.cpu_choose(st, "cpu")
        if act:
            engine.apply_action(st, "cpu", act)
        human_act = (
            {"type": "dive", "zone": 1} if st["kicker"] != "cpu" and not st["pendingDive"]
            else {"type": "shot", "zone": 2, "power": 60} if st["keeper"] != "cpu" and not st["pendingShot"]
            else None
        )
        if human_act:
            actor = st["keeper"] if human_act["type"] == "dive" else st["kicker"]
            engine.apply_action(st, actor, human_act)
        engine.drain_events(st)


def main():
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print(f"PASS {t.__name__}")
    print(f"ALL {len(tests)} ENGINE TESTS PASSED")


if __name__ == "__main__":
    main()
