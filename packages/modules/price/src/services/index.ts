import * as Price from './price'

export { Price }

/** Composite layer for the price module (no event bus — none in spec). */
export const PriceModuleLive = Price.layer
