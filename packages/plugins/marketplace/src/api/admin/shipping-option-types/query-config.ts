export const defaultAdminShippingOptionTypeFields = [
  "id",
  "label",
  "code",
  "description",
  "created_at",
  "updated_at",
]

export const retrieveShippingOptionTypeTransformQueryConfig = {
  defaults: defaultAdminShippingOptionTypeFields,
  isList: false,
}

export const listShippingOptionTypesTransformQueryConfig = {
  ...retrieveShippingOptionTypeTransformQueryConfig,
  defaultLimit: 20,
  isList: true,
}
