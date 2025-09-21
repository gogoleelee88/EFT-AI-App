# services/circuit_breaker.py
import asyncio
import time
import random
from typing import Any, Callable, Dict, Optional
from utils.logger import get_logger

logger = get_logger(__name__)

class CircuitBreaker:
    """
    회로차단기 (엔터프라이즈 확장판)
    - CLOSED -> (연속 실패 >= threshold) -> OPEN
    - OPEN -> (cooldown 지나면) -> HALF_OPEN
    - HALF_OPEN:
        * 동시 최대 half_open_max_probes 건만 시험(세마포어)
        * 성공 half_open_successes_needed 건 누적되면 CLOSED 복귀
        * 실패 1건이라도 발생하면 즉시 OPEN 회귀(쿨다운 리셋)
    """
    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: int = 60,
        expected_exception: type = Exception,
        half_open_max_probes: int = 10,
        half_open_successes_needed: int = 3,
    ):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.expected_exception = expected_exception

        self.state = "CLOSED"  # CLOSED, OPEN, HALF_OPEN
        self.failure_count = 0
        self.last_failure_time: Optional[float] = None

        # HALF_OPEN 동시성/상태 관리
        self._lock = asyncio.Lock()
        self._half_open_sem = asyncio.Semaphore(half_open_max_probes)
        self._half_open_max_probes = half_open_max_probes
        self._half_open_successes_needed = half_open_successes_needed
        self._half_open_successes = 0

    async def _maybe_to_half_open(self) -> None:
        """OPEN 상태에서 복구 타임아웃이 지났으면 HALF_OPEN으로 전환"""
        async with self._lock:
            if self.state != "OPEN":
                return
            if self.last_failure_time and (time.time() - self.last_failure_time) >= self.recovery_timeout:
                # HALF_OPEN 초기화
                self.state = "HALF_OPEN"
                self._half_open_successes = 0
                # 세마포어 리셋(이미 만들어져 있지만, value를 보장)
                self._half_open_sem = asyncio.Semaphore(self._half_open_max_probes)
                logger.info("회로차단기 HALF_OPEN 전환 (동시 프로브: %d)", self._half_open_max_probes)

    async def _to_open(self) -> None:
        async with self._lock:
            self.state = "OPEN"
            self.last_failure_time = time.time()
            # 실패 카운트는 OPEN에서 의미적으론 threshold 이상 상태
            self.failure_count = self.failure_threshold
            logger.warning("회로차단기 OPEN - 쿨다운 시작 (%ds)", self.recovery_timeout)

    async def _to_closed(self) -> None:
        async with self._lock:
            self.state = "CLOSED"
            self.failure_count = 0
            self._half_open_successes = 0
            logger.info("회로차단기 CLOSED 복귀")

    async def _record_closed_failure(self) -> None:
        async with self._lock:
            self.failure_count += 1
            if self.failure_count >= self.failure_threshold:
                await self._to_open()

    async def _record_closed_success(self) -> None:
        async with self._lock:
            self.failure_count = 0  # 연속 실패 끊김

    async def _record_half_open_success(self) -> None:
        async with self._lock:
            self._half_open_successes += 1
            if self._half_open_successes >= self._half_open_successes_needed:
                await self._to_closed()

    async def can_execute(self) -> bool:
        """
        실행 가능 여부(OPEN이면 쿨다운 체크 후 HALF_OPEN 전환 시도)
        HALF_OPEN 전환은 lazy 하게 필요 시점에 수행.
        """
        if self.state == "CLOSED":
            return True
        if self.state == "OPEN":
            await self._maybe_to_half_open()
            return self.state != "OPEN"
        # HALF_OPEN
        return True

    async def call(self, func: Callable, *args, **kwargs) -> Any:
        """
        회로차단기를 통해 비동기 함수 호출.
        상태별 처리:
          - CLOSED: 평소대로 호출, 실패 누적 시 OPEN
          - OPEN:   쿨다운 전이면 거부, 지나면 HALF_OPEN 진입
          - HALF_OPEN: 세마포어로 동시 k건 제한, 성공 n건 누적 시 CLOSED 복귀, 실패 즉시 OPEN
        """
        if not await self.can_execute():
            raise Exception(f"회로차단기 OPEN 상태 - 쿨다운 중 ({self.recovery_timeout}s)")

        if self.state == "CLOSED":
            try:
                result = await func(*args, **kwargs)
                await self._record_closed_success()
                return result
            except self.expected_exception as e:
                await self._record_closed_failure()
                raise e

        # HALF_OPEN
        await self._half_open_sem.acquire()
        try:
            result = await func(*args, **kwargs)
            await self._record_half_open_success()
            return result
        except self.expected_exception as e:
            # HALF_OPEN 중 실패 1건 → 즉시 OPEN 복귀
            await self._to_open()
            raise e
        finally:
            self._half_open_sem.release()


# 엔진별 회로차단기 풀
_breakers: Dict[str, CircuitBreaker] = {}

def get_circuit_breaker(
    engine_key: str,
    *,
    failure_threshold: int = 5,
    recovery_timeout: int = 60,
    half_open_max_probes: int = 10,
    half_open_successes_needed: int = 3,
    expected_exception: type = Exception,
) -> CircuitBreaker:
    if engine_key not in _breakers:
        _breakers[engine_key] = CircuitBreaker(
            failure_threshold=failure_threshold,
            recovery_timeout=recovery_timeout,
            expected_exception=expected_exception,
            half_open_max_probes=half_open_max_probes,
            half_open_successes_needed=half_open_successes_needed,
        )
    return _breakers[engine_key]


async def retry_with_exponential_backoff(
    func: Callable,
    *args,
    max_retries: int = 3,
    base_delay: float = 0.15,
    max_delay: float = 3.0,
    jitter: bool = True,
    **kwargs
) -> Any:
    """지수 백오프 + 지터 재시도 (엔진 5xx/네트워크간헐 대응)"""
    last_exc = None
    for attempt in range(max_retries + 1):
        try:
            return await func(*args, **kwargs)
        except Exception as e:
            last_exc = e
            if attempt == max_retries:
                logger.error("재시도 초과(%d): %s", max_retries, e)
                break
            delay = min(base_delay * (2 ** attempt), max_delay)
            if jitter:
                delay *= (0.8 + random.random() * 0.4)
            logger.warning("재시도 %d/%d, %.2fs 후 재시도: %s", attempt + 1, max_retries, delay, e)
            await asyncio.sleep(delay)
    raise last_exc