import BaseProvider from "../base";
import { cleanConfig } from "../../utils";
import { AsyncReturnType, Message } from "../../types";
import debug from "debug";
import React, { useMemo } from "react";
import LLMProviderInterface, { LLMConfig } from "../interface";
import useGlobal from "#/ui/context/global";
import { getHBValues } from "#/utils/barhandles";
import SettingItem from "#/ui/settings/components/item";
import Input from "#/ui/settings/components/input";
import { RequestUrlParam, requestUrl } from "obsidian";
import get from "lodash.get";
import { Handlebars } from "../../helpers/handlebars-helpers";
import clsx from "clsx";
import CustomProvider from "./base";

const logger = debug("textgenerator:CustomProvider");

const globalVars: Record<string, boolean> = {
  n: true,
  temperature: true,
  timeout: true,
  stream: true,
  messages: true,
  max_tokens: true,
  stop: true,
};

const testMessages = [
  {
    role: "user",
    content: "test",
  },
  {
    role: "assistant",
    content: `test2
test3

test4`,
  },
];

const default_values = {
  endpoint: "https://api.openai.com/v1/chat/completions",
  handlebars_headers_in: `{
      "Content-Type": "application/json",
      "authorization": "Bearer {{api_key}}"
}`,
  handlebars_body_in: `{
    "model": "{{model}}",
    "temperature": {{temperature}},
    "top_p": {{top_p}},
    "frequency_penalty": {{frequency_penalty}},
    "presence_penalty": {{presence_penalty}},
    "max_tokens": {{max_tokens}},
    "n": {{n}},
    "stream": {{stream}},
	"stop": "{{stop}}",
    "messages": [
      {{#each messages}}{{#if @index}},{{/if}}
      {
        "role": "{{role}}",
        "content": "{{escp content}}"
      }{{/each}}
    ]
  }`,
  path_to_choices: "choices",
  path_to_message_content: "message.content",
  path_to_error_message: "error.message",
  sanatization_streaming: `(chunk) => {
    let resultText = "";
    const lines = chunk.split("\\ndata: ");
  
    const parsedLines = lines
      .map((line) => line.replace(/^data: /, "").trim()) // Remove the "data: " prefix
      .filter((line) => line !== "" && line !== "[DONE]") // Remove empty lines and "[DONE]"
      .map((line) => JSON.parse(line)); // Parse the JSON string
  
    for (const parsedLine of parsedLines) {
      const { choices } = parsedLine;
      const { delta } = choices[0];
      const { content } = delta;
      // Update the UI with the new content
      if (content) {
        resultText += content;
      }
    }
    return resultText;
  }`,
};

export type CustomConfig = Record<keyof typeof default_values, string>;

const id = "Default (Custom)" as const;
export default class DefaultCustomProvider
  extends CustomProvider
  implements LLMProviderInterface {
  streamable = true;
  id = id;
  static slug = "custom" as const;
  static id = id;
  provider = "Custom";
  static provider = "Custom";
  RenderSettings(props: Parameters<LLMProviderInterface["RenderSettings"]>[0]) {
    const global = useGlobal();

    const config = (global.plugin.settings.LLMProviderOptions[
      props.self.id || "default"
    ] ??= {
      ...default_values,
      model: "gpt-3.5-turbo-16k",
      presence_penalty: 0.5,
      top_p: 1,
    });

    const vars = useMemo(() => {
      return getHBValues(
        `${config?.handlebars_headers_in} 
        ${config?.handlebars_body_in}`
      ).filter((d) => !globalVars[d]);
    }, [global.trg]);

    return (
      <>
        <SettingItem
          name="Endpoint"
          register={props.register}
          sectionId={props.sectionId}
        >
          <Input
            value={config.endpoint || default_values.endpoint}
            placeholder="Enter your API endpoint"
            setValue={async (value) => {
              config.endpoint = value;
              global.triggerReload();
              // TODO: it could use a debounce here
              await global.plugin.saveSettings();
            }}
          />
        </SettingItem>

        <div className="flex flex-col gap-1">
          <div className="font-bold">Headers:</div>
          <textarea
            placeholder="Headers"
            className="resize-none"
            defaultValue={
              config.handlebars_headers_in ||
              default_values.handlebars_headers_in
            }
            onChange={async (e) => {
              config.handlebars_headers_in = e.target.value;

              const compiled = await Handlebars.compile(
                config.handlebars_headers_in ||
                default_values.handlebars_headers_in
              )({
                ...global.plugin.settings,
                ...cleanConfig(config),
                n: 1,
                messages: testMessages,
              });

              console.log(compiled);
              try {
                console.log(JSON.parse(compiled));
              } catch (err: any) {
                console.warn(err);
              }

              global.triggerReload();
              await global.plugin.saveSettings();
            }}
            spellCheck={false}
            rows={5}
          />
        </div>

        <div className="flex flex-col gap-1">
          <div className="font-bold">Body:</div>
          <textarea
            placeholder="Textarea will autosize to fit the content"
            className="resize-none"
            defaultValue={
              config.handlebars_body_in || default_values.handlebars_body_in
            }
            onChange={async (e) => {
              config.handlebars_body_in = e.target.value;

              const compiled = await Handlebars.compile(
                config.handlebars_body_in || default_values.handlebars_body_in
              )({
                ...global.plugin.settings,
                ...cleanConfig(config),
                n: 1,
                messages: testMessages,
              });

              console.log(compiled);
              try {
                console.log(JSON.parse(compiled));
              } catch (err: any) {
                console.warn(err);
              }

              global.triggerReload();
              await global.plugin.saveSettings();
            }}
            spellCheck={false}
            rows={20}
          />
        </div>

        <div className="opacity-70">Variables</div>
        {vars.map((v: string) => (
          <SettingItem
            key={v}
            name={v}
            register={props.register}
            sectionId={props.sectionId}
          >
            <Input
              value={config[v]}
              placeholder={`Enter your ${v}`}
              type={v.toLowerCase().contains("key") ? "password" : "text"}
              setValue={async (value) => {
                config[v] = value;
                global.triggerReload();
                if (v.toLowerCase().contains("key"))
                  global.plugin.encryptAllKeys();
                // TODO: it could use a debounce here
                await global.plugin.saveSettings();
              }}
            />
          </SettingItem>
        ))}

        <div className="w-full pb-8"></div>

        <SettingItem
          name="Path to choices(Array) from response"
          register={props.register}
          sectionId={props.sectionId}
        >
          <Input
            value={config.path_to_choices || default_values.path_to_choices}
            placeholder="Enter your path to choices"
            setValue={async (value) => {
              config.path_to_choices = value;
              global.triggerReload();
              // TODO: it could use a debounce here
              await global.plugin.saveSettings();
            }}
          />
        </SettingItem>
        <div className="opacity-70">
          Path to the choices Array that has the messages
        </div>
        <SettingItem
          name="Path to message content(String) from choice object"
          register={props.register}
          sectionId={props.sectionId}
        >
          <Input
            value={
              config.path_to_message_content ||
              default_values.path_to_message_content
            }
            placeholder="Enter your path to message content"
            setValue={async (value) => {
              config.path_to_message_content = value;
              global.triggerReload();
              // TODO: it could use a debounce here
              await global.plugin.saveSettings();
            }}
          />
        </SettingItem>
        <div className="opacity-70">
          Path from one of the choices to the content(if left empty it will
          assume that the choices is an array of strings)
        </div>

        <SettingItem
          name="Path to error message from body"
          description="incase of an error (optional)"
          register={props.register}
          sectionId={props.sectionId}
        >
          <Input
            value={config.path_to_error_message}
            placeholder={default_values.path_to_error_message}
            setValue={async (value) => {
              config.path_to_error_message = value;
              global.triggerReload();
              // TODO: it could use a debounce here
              await global.plugin.saveSettings();
            }}
          />
        </SettingItem>
        <div className="opacity-70">
          Path to Error message from body object, incase of error, it will show it properly
        </div>

        <SettingItem
          name="CORS Bypass"
          description="enable this only if you get blocked by CORS, this will result in failure in some functions"
          register={props.register}
          sectionId={props.sectionId}
        >
          <Input
            type="checkbox"
            value={"" + config.CORSBypass}
            setValue={async (val) => {
              config.CORSBypass = val == "true";
              await global.plugin.saveSettings();
              global.triggerReload();
            }}
          />
        </SettingItem>
        <SettingItem
          name="Streamable"
          description={
            config.CORSBypass
              ? "Disable CORS Bypass to be able to use this feature"
              : "If enabled, means this API is streamable"
          }
          register={props.register}
          sectionId={props.sectionId}
          className={clsx({
            "cursor-not-allowed pointer-events-none opacity-60":
              config.CORSBypass,
          })}
        >
          <Input
            type="checkbox"
            value={!config.CORSBypass && config.streamable ? "true" : "false"}
            placeholder="Is it Streamable"
            setValue={async (value) => {
              config.streamable = value == "true";
              global.triggerReload();
              // TODO: it could use a debounce here
              await global.plugin.saveSettings();
            }}
          />
        </SettingItem>
        {!config.CORSBypass && config.streamable && (
          <>
            <div className="flex flex-col gap-1">
              <div className="font-bold">Sanatization(Streaming) function:</div>
              <textarea
                placeholder="Textarea will autosize to fit the content"
                value={
                  config.sanatization_streaming ||
                  default_values.sanatization_streaming
                }
                onChange={async (e) => {
                  config.sanatization_streaming = e.target.value;
                  global.triggerReload();
                  await global.plugin.saveSettings();
                }}
                spellCheck={false}
                rows={20}
              />
            </div>
          </>
        )}
      </>
    );
  }
}
