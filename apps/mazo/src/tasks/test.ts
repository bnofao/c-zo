import type { TaskConfig, CommandContext } from "@czo/czo";
import type { MedusaContainer } from "@medusajs/framework";

export const config: TaskConfig = {
    meta: {
        name: 'test',
        description: 'Test task',
    },
    args: {
        name: {
            type: 'string',
            description: 'Name',
        },
    },
}

export default async (context: CommandContext, container: MedusaContainer) => {
    console.log(context.args)
}