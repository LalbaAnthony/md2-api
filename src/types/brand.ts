declare const brandTag: unique symbol;

export type Brand<TValue, TName extends string> = TValue & {
  readonly [brandTag]: TName;
};
