import { z } from "zod"
import { createSelectParams } from "../../../../utils/validators"

export type AdminGetColumnsParamsType = z.infer<typeof AdminGetColumnsParams>
export const AdminGetColumnsParams = createSelectParams()
