import type {
  GuestBracket,
  PackageConfig,
  QuoteActivityItem,
  QuoteAdjustments,
  QuoteCalculationSummary,
  QuoteCityOption,
  SystemConfig,
  TravelInput,
} from '../lib/types';

export interface TravelCalculationParams {
  cityOption: QuoteCityOption;
  distanceOneWayKm: number;
  distanceSource: string;
  vehicleConsumptionKmPerL: number;
  fuelPricePerLiter: number;
  tolls: number;
  parking: number;
  vehicleWearPerKm: number;
  mealAllowance: number;
  chargeMeal: boolean;
  manualTravelAdjustment: number;
}

export function calculateTravelCosts(params: TravelCalculationParams): TravelInput {
  const oneWay = Math.max(0, Number(params.distanceOneWayKm || 0));
  const roundTrip = Number((oneWay * 2).toFixed(2));
  const totalKm = roundTrip;
  const consumption = Math.max(0.1, Number(params.vehicleConsumptionKmPerL || 5));
  const fuelPrice = Math.max(0, Number(params.fuelPricePerLiter || 0));
  const fuelCost = Number(((totalKm / consumption) * fuelPrice).toFixed(2));
  const tolls = Math.max(0, Number(params.tolls || 0));
  const parking = Math.max(0, Number(params.parking || 0));
  const wearCost = Number((totalKm * Math.max(0, Number(params.vehicleWearPerKm || 0))).toFixed(2));
  const meal = params.chargeMeal ? Math.max(0, Number(params.mealAllowance || 0)) : 0;
  const manualAdj = Number(params.manualTravelAdjustment || 0);

  const totalTravelCost = Number(
    Math.max(0, fuelCost + tolls + parking + wearCost + meal + manualAdj).toFixed(2)
  );

  return {
    distanceOneWayKm: oneWay,
    distanceRoundTripKm: roundTrip,
    distanceTotalKm: totalKm,
    distanceSource: params.distanceSource || 'Inserção manual',
    vehicleConsumptionKmPerL: consumption,
    fuelPricePerLiter: fuelPrice,
    fuelCost,
    tolls,
    parking,
    vehicleWearCost: wearCost,
    mealAllowance: meal,
    chargeMeal: params.chargeMeal,
    manualTravelAdjustment: manualAdj,
    totalTravelCost,
  };
}

export interface QuoteCalculationInput {
  pkg: PackageConfig;
  guestBracket: GuestBracket;
  estimatedGuests: number;
  selectedActivities: QuoteActivityItem[];
  travelInput: TravelInput;
  adjustments: QuoteAdjustments;
  otherExpenses?: number;
  config: SystemConfig;
}

export function calculateQuoteTotals(input: QuoteCalculationInput): QuoteCalculationSummary {
  const { pkg, guestBracket, estimatedGuests, selectedActivities, travelInput, adjustments, config } = input;
  const otherExpenses = Math.max(0, Number(input.otherExpenses || 0));
  const formula = config.pricingFormula || {
    mode: 'PACKAGE_PLUS_EXTRAS',
    includeBracketExtraFee: true,
    applyGuestMultiplierOnBase: true,
    defaultMarginPercent: 0,
  };

  const basePrice = Math.max(0, Number(pkg.basePrice || 0));
  const multiplier = formula.applyGuestMultiplierOnBase ? Math.max(0.1, Number(guestBracket.multiplier || 1)) : 1;
  const multipliedBase = Number((basePrice * multiplier).toFixed(2));
  const bracketDelta = Number((multipliedBase - basePrice + (formula.includeBracketExtraFee ? Number(guestBracket.extraFee || 0) : 0)).toFixed(2));

  let activitiesTotal = 0;
  let activitiesCost = 0;

  for (const act of selectedActivities) {
    if (!act.selected) continue;
    activitiesCost += Math.max(0, Number(act.estimatedCost || 0));
    if (!act.includedInPackage) {
      if (act.billingType === 'PER_GUEST') {
        activitiesTotal += Number((Math.max(0, act.unitPrice) * Math.max(1, estimatedGuests)).toFixed(2));
      } else {
        activitiesTotal += Math.max(0, Number(act.unitPrice || 0));
      }
    }
  }

  activitiesTotal = Number(activitiesTotal.toFixed(2));
  activitiesCost = Number(activitiesCost.toFixed(2));

  const subtotalBeforeMargin =
    formula.mode === 'ACTIVITIES_SUM_WITH_MARGIN'
      ? activitiesTotal + basePrice + bracketDelta + travelInput.totalTravelCost + otherExpenses
      : basePrice + bracketDelta + activitiesTotal + travelInput.totalTravelCost + otherExpenses;

  const marginPercent = Math.max(0, Number(formula.defaultMarginPercent || 0));
  const suggestedTotal = Number((subtotalBeforeMargin * (1 + marginPercent / 100)).toFixed(2));

  const discountPercentValue = Number(
    ((suggestedTotal * Math.max(0, Number(adjustments.discountPercent || 0))) / 100).toFixed(2)
  );
  const fixedDiscount = Math.max(0, Number(adjustments.discountValue || 0));
  const discountTotal = Number((discountPercentValue + fixedDiscount).toFixed(2));

  const surchargeTotal = Number(
    (Math.max(0, Number(adjustments.surchargeValue || 0)) + Number(adjustments.manualAdjustment || 0)).toFixed(2)
  );

  const finalTotal = Number(Math.max(0, suggestedTotal - discountTotal + surchargeTotal).toFixed(2));

  const estimatedInternalCost = Number(
    (Math.max(0, Number(pkg.estimatedCost || 0)) + activitiesCost + travelInput.totalTravelCost + otherExpenses).toFixed(2)
  );
  const estimatedProfit = Number((finalTotal - estimatedInternalCost).toFixed(2));
  const estimatedMarginPercent =
    finalTotal > 0 ? Number(((estimatedProfit / finalTotal) * 100).toFixed(1)) : 0;

  return {
    packageBaseValue: basePrice,
    activitiesTotal,
    guestBracketAdjustment: bracketDelta,
    travelTotal: travelInput.totalTravelCost,
    otherExpenses,
    discountTotal,
    surchargeTotal,
    suggestedTotal,
    finalTotal,
    estimatedInternalCost,
    estimatedProfit,
    estimatedMarginPercent,
  };
}
