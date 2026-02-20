# services/circuit_breaker.py
import asyncio
import time
import random
from typing import Any, Callable, Dict, Optional
from utils.logger import get_logger

logger = get_logger(__name__)

class CircuitBreaker:
    """
    ?Œë¡œì°¨ë‹¨ê¸?(?”í„°?„ë¼?´ì¦ˆ ?•ì¥??
    - CLOSED -> (?°ì† ?¤íŒ¨ >= threshold) -> OPEN
    - OPEN -> (cooldown ì§€?˜ë©´) -> HALF_OPEN
    - HALF_OPEN:
        * ?™ì‹œ ìµœë? half_open_max_probes ê±´ë§Œ ?œí—˜(?¸ë§ˆ?¬ì–´)
        * ?±ê³µ half_open_successes_needed ê±??„ì ?˜ë©´ CLOSED ë³µê?
        * ?¤íŒ¨ 1ê±´ì´?¼ë„ ë°œìƒ?˜ë©´ ì¦‰ì‹œ OPEN ?Œê?(ì¿¨ë‹¤??ë¦¬ì…‹)
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

        # HALF_OPEN ?™ì‹œ???íƒœ ê´€ë¦?        self._lock = asyncio.Lock()
        self._half_open_sem = asyncio.Semaphore(half_open_max_probes)
        self._half_open_max_probes = half_open_max_probes
        self._half_open_successes_needed = half_open_successes_needed
        self._half_open_successes = 0

    async def _maybe_to_half_open(self) -> None:
        """OPEN ?íƒœ?ì„œ ë³µêµ¬ ?€?„ì•„?ƒì´ ì§€?¬ìœ¼ë©?HALF_OPEN?¼ë¡œ ?„í™˜"""
        async with self._lock:
            if self.state != "OPEN":
                return
            if self.last_failure_time and (time.time() - self.last_failure_time) >= self.recovery_timeout:
                # HALF_OPEN ì´ˆê¸°??                self.state = "HALF_OPEN"
                self._half_open_successes = 0
                # ?¸ë§ˆ?¬ì–´ ë¦¬ì…‹(?´ë? ë§Œë“¤?´ì ¸ ?ˆì?ë§? valueë¥?ë³´ì¥)
                self._half_open_sem = asyncio.Semaphore(self._half_open_max_probes)
                logger.info("?Œë¡œì°¨ë‹¨ê¸?HALF_OPEN ?„í™˜ (?™ì‹œ ?„ë¡œë¸? %d)", self._half_open_max_probes)

    async def _to_open(self) -> None:
        async with self._lock:
            self.state = "OPEN"
            self.last_failure_time = time.time()
            # ?¤íŒ¨ ì¹´ìš´?¸ëŠ” OPEN?ì„œ ?˜ë??ìœ¼ë¡?threshold ?´ìƒ ?íƒœ
            self.failure_count = self.failure_threshold
            logger.warning("?Œë¡œì°¨ë‹¨ê¸?OPEN - ì¿¨ë‹¤???œì‘ (%ds)", self.recovery_timeout)

    async def _to_closed(self) -> None:
        async with self._lock:
            self.state = "CLOSED"
            self.failure_count = 0
            self._half_open_successes = 0
            logger.info("?Œë¡œì°¨ë‹¨ê¸?CLOSED ë³µê?")

    async def _record_closed_failure(self) -> None:
        async with self._lock:
            self.failure_count += 1
            if self.failure_count >= self.failure_threshold:
                await self._to_open()

    async def _record_closed_success(self) -> None:
        async with self._lock:
            self.failure_count = 0  # ?°ì† ?¤íŒ¨ ?Šê?

    async def _record_half_open_success(self) -> None:
        async with self._lock:
            self._half_open_successes += 1
            if self._half_open_successes >= self._half_open_successes_needed:
                await self._to_closed()

    async def can_execute(self) -> bool:
        """
        ?¤í–‰ ê°€???¬ë?(OPEN?´ë©´ ì¿¨ë‹¤??ì²´í¬ ??HALF_OPEN ?„í™˜ ?œë„)
        HALF_OPEN ?„í™˜?€ lazy ?˜ê²Œ ?„ìš” ?œì ???˜í–‰.
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
        ?Œë¡œì°¨ë‹¨ê¸°ë? ?µí•´ ë¹„ë™ê¸??¨ìˆ˜ ?¸ì¶œ.
        ?íƒœë³?ì²˜ë¦¬:
          - CLOSED: ?‰ì†Œ?€ë¡??¸ì¶œ, ?¤íŒ¨ ?„ì  ??OPEN
          - OPEN:   ì¿¨ë‹¤???„ì´ë©?ê±°ë?, ì§€?˜ë©´ HALF_OPEN ì§„ì…
          - HALF_OPEN: ?¸ë§ˆ?¬ì–´ë¡??™ì‹œ kê±??œí•œ, ?±ê³µ nê±??„ì  ??CLOSED ë³µê?, ?¤íŒ¨ ì¦‰ì‹œ OPEN
        """
        if not await self.can_execute():
            raise Exception(f"?Œë¡œì°¨ë‹¨ê¸?OPEN ?íƒœ - ì¿¨ë‹¤??ì¤?({self.recovery_timeout}s)")

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
            # HALF_OPEN ì¤??¤íŒ¨ 1ê±???ì¦‰ì‹œ OPEN ë³µê?
            await self._to_open()
            raise e
        finally:
            self._half_open_sem.release()


# ?”ì§„ë³??Œë¡œì°¨ë‹¨ê¸??€
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
    """ì§€??ë°±ì˜¤??+ ì§€???¬ì‹œ??(?”ì§„ 5xx/?¤íŠ¸?Œí¬ê°„í— ?€??"""
    last_exc = None
    for attempt in range(max_retries + 1):
        try:
            return await func(*args, **kwargs)
        except Exception as e:
            last_exc = e
            if attempt == max_retries:
                logger.error("?¬ì‹œ??ì´ˆê³¼(%d): %s", max_retries, e)
                break
            delay = min(base_delay * (2 ** attempt), max_delay)
            if jitter:
                delay *= (0.8 + random.random() * 0.4)
            logger.warning("?¬ì‹œ??%d/%d, %.2fs ???¬ì‹œ?? %s", attempt + 1, max_retries, delay, e)
            await asyncio.sleep(delay)
    raise last_exc
