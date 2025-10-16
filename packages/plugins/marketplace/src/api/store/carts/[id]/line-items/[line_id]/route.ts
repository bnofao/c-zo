import {
  deleteLineItemsWorkflowId,
  updateLineItemInCartWorkflowId,
} from "@medusajs/core-flows"
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { AdditionalData, HttpTypes } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { refetchCart } from "../../../helpers"
import { StoreUpdateCartLineItemType } from "../../../validators"

export const POST = async (
  req: MedusaRequest<StoreUpdateCartLineItemType & AdditionalData>,
  res: MedusaResponse<HttpTypes.StoreCartResponse>
) => {
  const we = req.scope.resolve(Modules.WORKFLOW_ENGINE)
  await we.run(updateLineItemInCartWorkflowId, {
    input: {
      cart_id: req.params.id,
      item_id: req.params.line_id,
      update: req.validatedBody,
      additional_data: req.validatedBody.additional_data,
    },
    transactionId: "cart-update-item-" + req.params.id,
  })

  const updatedCart = await refetchCart(
    req.params.id,
    req.scope,
    req.queryConfig.fields
  )

  res.status(200).json({ cart: updatedCart })
}

export const DELETE = async (
  req: MedusaRequest,
  res: MedusaResponse<HttpTypes.StoreLineItemDeleteResponse>
) => {
  const id = req.params.line_id

  const we = req.scope.resolve(Modules.WORKFLOW_ENGINE)
  await we.run(deleteLineItemsWorkflowId, {
    input: {
      cart_id: req.params.id,
      ids: [id],
    },
    transactionId: "cart-delete-item-" + req.params.id,
  })

  const cart = await refetchCart(
    req.params.id,
    req.scope,
    req.queryConfig.fields
  )

  res.status(200).json({
    id: id,
    object: "line-item",
    deleted: true,
    parent: cart,
  })
}
