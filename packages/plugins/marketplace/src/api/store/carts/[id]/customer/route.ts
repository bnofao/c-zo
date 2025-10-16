import { transferCartCustomerWorkflowId } from "@medusajs/core-flows"
import { HttpTypes } from "@medusajs/framework/types"

import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { refetchCart } from "../../helpers"
import { StoreUpdateCartCustomerType } from "../../validators"
import { AdditionalData } from "@medusajs/framework/types"

export const POST = async (
  req: AuthenticatedMedusaRequest<StoreUpdateCartCustomerType & AdditionalData>,
  res: MedusaResponse<HttpTypes.StoreCartResponse>
) => {
  const we = req.scope.resolve(Modules.WORKFLOW_ENGINE)

  await we.run(transferCartCustomerWorkflowId, {
    input: {
      id: req.params.id,
      customer_id: req.auth_context?.actor_id,
      additional_data: req.validatedBody.additional_data,
    },
    transactionId: "cart-transfer-customer-" + req.params.id,
  })

  const cart = await refetchCart(
    req.params.id,
    req.scope,
    req.queryConfig.fields
  )

  res.status(200).json({ cart })
}
