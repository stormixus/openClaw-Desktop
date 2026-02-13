export type JanggiRuleSet = {
  palaceDiagonalFor: {
    king: boolean;
    guard: boolean;
    rook: boolean;
    cannon: boolean;
  };
  cannonCaptureCannonAllowed: boolean;
  elephantPattern: "kr_standard" | "variantA";
  horsePattern: "kr_standard" | "variantA";
  startingSetup: "standard" | "variantA";
};

export const defaultJanggiRuleSet: JanggiRuleSet = {
  palaceDiagonalFor: {
    king: true,
    guard: true,
    rook: false,
    cannon: false,
  },
  cannonCaptureCannonAllowed: false,
  elephantPattern: "kr_standard",
  horsePattern: "kr_standard",
  startingSetup: "standard",
};
