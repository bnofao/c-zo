import { updateCartPromotionsWorkflowId } from "@medusajs/core-flows"
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { HttpTypes } from "@medusajs/framework/types"
import { Modules, PromotionActions } from "@medusajs/framework/utils"
import { refetchCart } from "../../helpers"

export const POST = async (
  req: MedusaRequest<HttpTypes.StoreCartAddPromotion>,
  res: MedusaResponse<HttpTypes.StoreCartResponse>
) => {
  const we = req.scope.resolve(Modules.WORKFLOW_ENGINE)
  const payload = req.validatedBody

  await we.run(updateCartPromotionsWorkflowId, {
    input: {
      promo_codes: payload.promo_codes,
      cart_id: req.params.id,
      action:
        payload.promo_codes.length > 0
          ? PromotionActions.ADD
          : PromotionActions.REPLACE,
    },
    transactionId: "cart-update-promotions-" + req.params.id,
  })

  const cart = await refetchCart(
    req.params.id,
    req.scope,
    req.queryConfig.fields
  )

  res.status(200).json({ cart })
}

export const DELETE = async (
  req: MedusaRequest<HttpTypes.StoreCartRemovePromotion>,
  res: MedusaResponse<{
    cart: HttpTypes.StoreCart
  }>
) => {
  const we = req.scope.resolve(Modules.WORKFLOW_ENGINE)
  const payload = req.validatedBody

  await we.run(updateCartPromotionsWorkflowId, {
    input: {
      promo_codes: payload.promo_codes,
      cart_id: req.params.id,
      action: PromotionActions.REMOVE,
    },
    transactionId: "cart-delete-promotions-" + req.params.id,
  })

  const cart = await refetchCart(
    req.params.id,
    req.scope,
    req.queryConfig.fields
  )

  res.status(200).json({ cart })
}
