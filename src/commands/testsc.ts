import { ChatInputCommandInteraction, Client, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { IBotInteraction } from "../api/capi";

export default class TestSubcommands implements IBotInteraction {
    name(): string {
        return "testsc";
    }

    help(): string {
        return "Simple demo of subcommands: user/server.";
    }

    cooldown(): number {
        return 2;
    }

    isThisInteraction(command: string): boolean {
        return command === this.name();
    }

    data(): any {
        return new SlashCommandBuilder()
            .setName(this.name())
            .setDescription(this.help())
            .addSubcommand(sub =>
                sub
                    .setName('user')
                    .setDescription('Info about a user')
                    .addUserOption(option => option
                        .setName('target')
                        .setDescription('The user')
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('server')
                    .setDescription('Info about the server')
            );
    }

    perms(): "admin" | "user" | "both" {
        return "user";
    }

    async runCommand(interaction: ChatInputCommandInteraction, Bot: Client): Promise<void> {
        const sub = interaction.options.getSubcommand();

        if (sub === 'user') {
            const user = interaction.options.getUser('target') ?? interaction.user;

            const embed = new EmbedBuilder()
                .setTitle('User info')
                .addFields(
                    { name: 'Tag', value: `${user.tag}`, inline: true },
                    { name: 'ID', value: `${user.id}`, inline: true },
                )
                .setThumbnail(user.displayAvatarURL())
                .setTimestamp(new Date());

            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }

        if (sub === 'server') {
            const guild = interaction.guild;
            if (!guild) {
                await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle('Server info')
                .addFields(
                    { name: 'Name', value: guild.name, inline: true },
                    { name: 'ID', value: guild.id, inline: true },
                    { name: 'Member count', value: `${guild.memberCount}`, inline: true },
                )
                .setThumbnail(guild.iconURL() ?? null)
                .setTimestamp(new Date());

            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }

        await interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
    }
}
