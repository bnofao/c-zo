/* This file was automatically generated. DO NOT UPDATE MANUALLY. */
    import type   { Resolvers } from './types.generated';
    import    { category as Query_category } from './../../dist/schema/category/resolvers/Query/category';
import    { categoryTree as Query_categoryTree } from './../../dist/schema/category/resolvers/Query/categoryTree';
import    { collection as Query_collection } from './../../dist/schema/collection/resolvers/Query/collection';
import    { product as Query_product } from './../../dist/schema/product/resolvers/Query/product';
import    { productOptions as Query_productOptions } from './../../dist/schema/option/resolvers/Query/productOptions';
import    { productType as Query_productType } from './../../dist/schema/type/resolvers/Query/productType';
import    { productTypes as Query_productTypes } from './../../dist/schema/type/resolvers/Query/productTypes';
import    { products as Query_products } from './../../dist/schema/product/resolvers/Query/products';
import    { productsByCollection as Query_productsByCollection } from './../../dist/schema/collection/resolvers/Query/productsByCollection';
import    { tag as Query_tag } from './../../dist/schema/tag/resolvers/Query/tag';
import    { tags as Query_tags } from './../../dist/schema/tag/resolvers/Query/tags';
import    { variant as Query_variant } from './../../dist/schema/variant/resolvers/Query/variant';
import    { addOptionValue as Mutation_addOptionValue } from './../../dist/schema/option/resolvers/Mutation/addOptionValue';
import    { assignProductToCategories as Mutation_assignProductToCategories } from './../../dist/schema/category/resolvers/Mutation/assignProductToCategories';
import    { assignTagsToProduct as Mutation_assignTagsToProduct } from './../../dist/schema/tag/resolvers/Mutation/assignTagsToProduct';
import    { associateImageWithVariant as Mutation_associateImageWithVariant } from './../../dist/schema/image/resolvers/Mutation/associateImageWithVariant';
import    { associateVariantOptions as Mutation_associateVariantOptions } from './../../dist/schema/option/resolvers/Mutation/associateVariantOptions';
import    { createCategory as Mutation_createCategory } from './../../dist/schema/category/resolvers/Mutation/createCategory';
import    { createCollection as Mutation_createCollection } from './../../dist/schema/collection/resolvers/Mutation/createCollection';
import    { createProduct as Mutation_createProduct } from './../../dist/schema/product/resolvers/Mutation/createProduct';
import    { createProductOption as Mutation_createProductOption } from './../../dist/schema/option/resolvers/Mutation/createProductOption';
import    { createProductType as Mutation_createProductType } from './../../dist/schema/type/resolvers/Mutation/createProductType';
import    { createProductVariant as Mutation_createProductVariant } from './../../dist/schema/variant/resolvers/Mutation/createProductVariant';
import    { createTag as Mutation_createTag } from './../../dist/schema/tag/resolvers/Mutation/createTag';
import    { deleteCategory as Mutation_deleteCategory } from './../../dist/schema/category/resolvers/Mutation/deleteCategory';
import    { deleteCollection as Mutation_deleteCollection } from './../../dist/schema/collection/resolvers/Mutation/deleteCollection';
import    { deleteOptionValue as Mutation_deleteOptionValue } from './../../dist/schema/option/resolvers/Mutation/deleteOptionValue';
import    { deleteProduct as Mutation_deleteProduct } from './../../dist/schema/product/resolvers/Mutation/deleteProduct';
import    { deleteProductImage as Mutation_deleteProductImage } from './../../dist/schema/image/resolvers/Mutation/deleteProductImage';
import    { deleteProductType as Mutation_deleteProductType } from './../../dist/schema/type/resolvers/Mutation/deleteProductType';
import    { deleteProductVariant as Mutation_deleteProductVariant } from './../../dist/schema/variant/resolvers/Mutation/deleteProductVariant';
import    { deleteTag as Mutation_deleteTag } from './../../dist/schema/tag/resolvers/Mutation/deleteTag';
import    { updateCategory as Mutation_updateCategory } from './../../dist/schema/category/resolvers/Mutation/updateCategory';
import    { updateCollection as Mutation_updateCollection } from './../../dist/schema/collection/resolvers/Mutation/updateCollection';
import    { updateProduct as Mutation_updateProduct } from './../../dist/schema/product/resolvers/Mutation/updateProduct';
import    { updateProductType as Mutation_updateProductType } from './../../dist/schema/type/resolvers/Mutation/updateProductType';
import    { updateProductVariant as Mutation_updateProductVariant } from './../../dist/schema/variant/resolvers/Mutation/updateProductVariant';
import    { uploadProductImage as Mutation_uploadProductImage } from './../../dist/schema/image/resolvers/Mutation/uploadProductImage';
import    { BooleanPayload } from './../../dist/schema/common/resolvers/BooleanPayload';
import    { CategoryNode } from './../../dist/schema/category/resolvers/CategoryNode';
import    { CategoryPayload } from './../../dist/schema/category/resolvers/CategoryPayload';
import    { CollectionPayload } from './../../dist/schema/collection/resolvers/CollectionPayload';
import    { DeletePayload } from './../../dist/schema/common/resolvers/DeletePayload';
import    { Error } from './../../dist/schema/common/resolvers/Error';
import    { ImagePayload } from './../../dist/schema/image/resolvers/ImagePayload';
import    { OptionPayload } from './../../dist/schema/option/resolvers/OptionPayload';
import    { OptionValuePayload } from './../../dist/schema/option/resolvers/OptionValuePayload';
import    { PageInfo } from './../../dist/schema/common/resolvers/PageInfo';
import    { Product } from './../../dist/schema/product/resolvers/Product';
import    { ProductCategory } from './../../dist/schema/category/resolvers/ProductCategory';
import    { ProductCollection } from './../../dist/schema/collection/resolvers/ProductCollection';
import    { ProductConnection } from './../../dist/schema/product/resolvers/ProductConnection';
import    { ProductImage } from './../../dist/schema/image/resolvers/ProductImage';
import    { ProductOption } from './../../dist/schema/option/resolvers/ProductOption';
import    { ProductOptionValue } from './../../dist/schema/option/resolvers/ProductOptionValue';
import    { ProductPayload } from './../../dist/schema/product/resolvers/ProductPayload';
import    { ProductTag } from './../../dist/schema/tag/resolvers/ProductTag';
import    { ProductType } from './../../dist/schema/type/resolvers/ProductType';
import    { ProductVariant } from './../../dist/schema/variant/resolvers/ProductVariant';
import    { TagPayload } from './../../dist/schema/tag/resolvers/TagPayload';
import    { TypePayload } from './../../dist/schema/type/resolvers/TypePayload';
import    { VariantPayload } from './../../dist/schema/variant/resolvers/VariantPayload';
import    { DateTime } from './common/resolvers/DateTime';
import    { JSON } from './common/resolvers/JSON';
    export const resolvers: Resolvers = {
      Query: { category: Query_category,categoryTree: Query_categoryTree,collection: Query_collection,product: Query_product,productOptions: Query_productOptions,productType: Query_productType,productTypes: Query_productTypes,products: Query_products,productsByCollection: Query_productsByCollection,tag: Query_tag,tags: Query_tags,variant: Query_variant },
      Mutation: { addOptionValue: Mutation_addOptionValue,assignProductToCategories: Mutation_assignProductToCategories,assignTagsToProduct: Mutation_assignTagsToProduct,associateImageWithVariant: Mutation_associateImageWithVariant,associateVariantOptions: Mutation_associateVariantOptions,createCategory: Mutation_createCategory,createCollection: Mutation_createCollection,createProduct: Mutation_createProduct,createProductOption: Mutation_createProductOption,createProductType: Mutation_createProductType,createProductVariant: Mutation_createProductVariant,createTag: Mutation_createTag,deleteCategory: Mutation_deleteCategory,deleteCollection: Mutation_deleteCollection,deleteOptionValue: Mutation_deleteOptionValue,deleteProduct: Mutation_deleteProduct,deleteProductImage: Mutation_deleteProductImage,deleteProductType: Mutation_deleteProductType,deleteProductVariant: Mutation_deleteProductVariant,deleteTag: Mutation_deleteTag,updateCategory: Mutation_updateCategory,updateCollection: Mutation_updateCollection,updateProduct: Mutation_updateProduct,updateProductType: Mutation_updateProductType,updateProductVariant: Mutation_updateProductVariant,uploadProductImage: Mutation_uploadProductImage },
      
      BooleanPayload: BooleanPayload,
CategoryNode: CategoryNode,
CategoryPayload: CategoryPayload,
CollectionPayload: CollectionPayload,
DeletePayload: DeletePayload,
Error: Error,
ImagePayload: ImagePayload,
OptionPayload: OptionPayload,
OptionValuePayload: OptionValuePayload,
PageInfo: PageInfo,
Product: Product,
ProductCategory: ProductCategory,
ProductCollection: ProductCollection,
ProductConnection: ProductConnection,
ProductImage: ProductImage,
ProductOption: ProductOption,
ProductOptionValue: ProductOptionValue,
ProductPayload: ProductPayload,
ProductTag: ProductTag,
ProductType: ProductType,
ProductVariant: ProductVariant,
TagPayload: TagPayload,
TypePayload: TypePayload,
VariantPayload: VariantPayload,
DateTime: DateTime,
JSON: JSON
    }