export interface MyPageFormState {
  aspirationStatement: string;
  targetIdentity: string;
  northStarGoal: string;
  horizon90dText: string;
  valuesText: string;
  constraintsText: string;
  strengthsText: string;
  experienceText: string;
  domainFocusText: string;
  certificationsText: string;
  toolStackText: string;
}

export const EMPTY_MY_PAGE_FORM: MyPageFormState = {
  aspirationStatement: "",
  targetIdentity: "",
  northStarGoal: "",
  horizon90dText: "",
  valuesText: "",
  constraintsText: "",
  strengthsText: "",
  experienceText: "",
  domainFocusText: "",
  certificationsText: "",
  toolStackText: "",
};

const MULTI_LINE_KEYS: Array<keyof MyPageFormState> = [
  "horizon90dText",
  "valuesText",
  "constraintsText",
  "strengthsText",
  "experienceText",
  "domainFocusText",
  "certificationsText",
  "toolStackText",
];

const normalizeSingleLine = (value: string) => value.trim();

const normalizeMultiLine = (value: string) =>
  value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");

export const splitLines = (input: string): string[] =>
  input
    .split(/\n|,/g)
    .map((value) => value.trim())
    .filter(Boolean);

export const joinLines = (items?: string[] | null): string =>
  Array.isArray(items) ? items.filter(Boolean).join("\n") : "";

export const normalizeMyPageForm = (form: MyPageFormState): MyPageFormState => {
  const normalized = { ...form };

  (Object.keys(normalized) as Array<keyof MyPageFormState>).forEach((key) => {
    const nextValue = MULTI_LINE_KEYS.includes(key)
      ? normalizeMultiLine(normalized[key])
      : normalizeSingleLine(normalized[key]);
    normalized[key] = nextValue;
  });

  return normalized;
};

export const hasProfileContent = (form: MyPageFormState) =>
  Object.values(normalizeMyPageForm(form)).some((value) => value.length > 0);

export const buildProfileCompletion = (form: MyPageFormState) => {
  const normalized = normalizeMyPageForm(form);
  const importantKeys: Array<keyof MyPageFormState> = [
    "aspirationStatement",
    "targetIdentity",
    "northStarGoal",
    "horizon90dText",
    "valuesText",
    "strengthsText",
    "experienceText",
    "domainFocusText",
    "toolStackText",
  ];
  const completed = importantKeys.filter((key) => normalized[key].length > 0).length;
  return Math.round((completed / importantKeys.length) * 100);
};

export const buildProfileReadiness = (form: MyPageFormState) => {
  const normalized = normalizeMyPageForm(form);

  return {
    identity:
      normalized.aspirationStatement.length > 0 &&
      normalized.targetIdentity.length > 0 &&
      normalized.northStarGoal.length > 0,
    plan:
      normalized.horizon90dText.length > 0 &&
      normalized.valuesText.length > 0,
    execution:
      normalized.strengthsText.length > 0 &&
      normalized.domainFocusText.length > 0 &&
      normalized.toolStackText.length > 0,
  };
};
