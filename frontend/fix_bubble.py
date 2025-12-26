#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ARHolisticTest.tsx 비눗방울 로직 수정 스크립트
"""

import sys

def fix_bubble_logic():
    file_path = 'src/pages/ARHolisticTest.tsx'

    # 파일 읽기
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    # 수정할 부분 찾기 (1773번 줄 부근)
    modified = False
    i = 0
    while i < len(lines):
        line = lines[i]

        # if (hit && nowTap 패턴 찾기
        if 'if (hit && nowTap - lastTapTimeRef.current > TAP_COOLDOWN_MS)' in line:
            print(f"패턴을 {i+1}번째 줄에서 찾았습니다!")

            # 다음 몇 줄 확인
            if i+5 < len(lines) and 'setIsBubbleVisible(false)' in lines[i+3]:
                print("수정 위치 확정!")

                # 새로운 코드 블록 생성
                indent = '                '
                new_block = [
                    lines[i],  # if (hit && ...
                    '\n',
                    indent + 'lastTapTimeRef.current = nowTap;\n',
                    '\n',
                    indent + '// 1. 떠 있는 비눗방울을 즉시 숨깁니다.\n',
                    indent + 'setIsBubbleVisible(false);\n',
                    '\n',
                    indent + '// 2. 터지는 애니메이션을 위한 좌표를 현재 두더지 위치(curPt)로 설정합니다.\n',
                    indent + 'setBubblePos({\n',
                    indent + '  x: curPt.x / c.width,\n',
                    indent + '  y: curPt.y / c.height,\n',
                    indent + '});\n',
                    '\n',
                    indent + '// 3. 키값을 바꿔서 애니메이션이 매번 처음부터 다시 실행되게 합니다. (필수!)\n',
                    indent + 'setBubblePopKey((k) => k + 1);\n',
                    '\n',
                    indent + '// 4. 점수 처리 (필요 없으시더라도 포인트 이동을 위해 내부 로직은 유지)\n',
                    indent + 'if (moodScoreRef.current > 0) {\n',
                    indent + '  moodScoreRef.current = moodScoreRef.current - 1;\n',
                    indent + '  setMoodScore(moodScoreRef.current);\n',
                    indent + '  if (moodScoreRef.current <= 0) guideEngineRef.current.deadlineMs = nowTap;\n',
                    indent + '}\n',
                    '\n',
                ]

                # 기존 if (moodScoreRef.current > 0) 블록의 끝 찾기
                j = i + 1
                brace_count = 0
                found_moodScore_block = False

                while j < len(lines):
                    if 'if (moodScoreRef.current > 0)' in lines[j]:
                        found_moodScore_block = True
                        brace_count = 1
                        j += 1
                        continue

                    if found_moodScore_block:
                        if '{' in lines[j]:
                            brace_count += lines[j].count('{')
                        if '}' in lines[j]:
                            brace_count -= lines[j].count('}')

                        if brace_count == 0:
                            # if 블록의 끝을 찾음
                            j += 1
                            break

                    j += 1

                # 새로운 라인들로 교체
                lines = lines[:i] + new_block + lines[j:]
                modified = True
                print(f"수정 완료! {i+1}번째 줄부터 {j}번째 줄까지 교체했습니다.")
                break

        i += 1

    if modified:
        # 파일 쓰기
        with open(file_path, 'w', encoding='utf-8') as f:
            f.writelines(lines)
        print("✅ 파일 저장 완료!")
        return 0
    else:
        print("❌ 수정할 패턴을 찾지 못했습니다.")
        return 1

if __name__ == '__main__':
    sys.exit(fix_bubble_logic())
