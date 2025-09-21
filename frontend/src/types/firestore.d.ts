declare type TurnId = string; // zero-pad된 문자열

declare function fsCreateTurn(
  sessionId: string,
  data: Record<string, unknown>
): Promise<TurnId>;

declare function fsSetTurnSUDS(
  sessionId: string,
  turnId: TurnId,
  payload: { sudsPre?: number; sudsPost?: number }
): Promise<void>;

declare function fsSetSessionSUDS(
  sessionId: string,
  payload: { pre?: number; post?: number }
): Promise<void>;

declare function fsAppendABTelemetry(
  sessionId: string,
  data: Record<string, unknown>
): Promise<void>;