import { AnyFramework, StoryId } from '@storybook/csf';
import { Story, CSFFile } from '@storybook/store';
import { DOCS_RENDERED } from '@storybook/core-events';

import { Render, RenderType } from './Render';
import type { DocsContextProps, DocsRenderFunction } from '../types';
import { AbstractDocsRender } from './AbstractDocsRender';

export class TemplateDocsRender<
  TFramework extends AnyFramework
> extends AbstractDocsRender<TFramework> {
  public type: RenderType = 'docs';

  public story?: Story<TFramework>;

  public teardown?: (options: { viewModeChanged?: boolean }) => Promise<void>;

  public torndown = false;

  async prepare() {
    this.preparing = true;
    await super.prepare();

    const { importPath, title } = this.entry;
    this.csfFiles!.unshift(
      await this.store.processCSFFileWithCache(this.exports!, importPath, title)
    );

    // We use the first ("primary") story from the CSF as the "current" story on the context.
    //   - When rendering "true" CSF files, this is for back-compat, where templates may expect
    //     a story to be current (even though now we render a separate docs entry from the stories)
    //   - when rendering a "docs only" (story) id, this will end up being the same story as
    //     this.id, as such "CSF files" have only one story
    this.story = this.storyById(Object.keys(this.csfFiles![0].stories)[0]);
  }

  isEqual(other: Render<TFramework>): boolean {
    return !!(
      this.id === other.id &&
      this.story &&
      this.story === (other as TemplateDocsRender<TFramework>).story
    );
  }

  storyById(storyId: StoryId) {
    if (!this.csfFiles) throw new Error(`Cannot call storyById before preparing`);

    const csfFile = this.csfFiles.find((f) => !!f.stories[storyId]);
    if (!csfFile)
      throw new Error(`Didn't find '${storyId}' in a loaded CSF file, this is unexpected`);

    return this.store.storyFromCSFFile({ storyId, csfFile });
  }

  async getDocsContext(
    renderStoryToElement: DocsContextProps<TFramework>['renderStoryToElement']
  ): Promise<DocsContextProps<TFramework>> {
    const { title, name } = this.entry;

    const { csfFiles } = this;
    if (!csfFiles || !this.story) throw new Error(`Cannot get docs context before preparing`);

    const componentStories = () =>
      csfFiles.flatMap((csfFile) => this.store.componentStoriesFromCSFFile({ csfFile }));

    const storyIdByModuleExport = () => {
      // NOTE: we could implement this easily enough by checking all the component stories
      throw new Error('`storyIdByModuleExport` not available for legacy docs files.');
    };

    return {
      // TODO
      type: 'legacy',
      // NOTE: we use the id of the loaded story for reasons discussed in .prepare() above
      id: this.story.id,
      title,
      name,
      renderStoryToElement,
      loadStory: this.loadStory.bind(this),
      getStoryContext: this.getStoryContext.bind(this),
      componentStories,
      storyIdByModuleExport,
      storyById: this.storyById.bind(this),
      setMeta: () => {},
    };
  }

  async render() {
    if (!this.story || !this.docsContext || !this.canvasElement)
      throw new Error('DocsRender not ready to render');

    const { docs } = this.story?.parameters || {};

    if (!docs)
      throw new Error(
        `Cannot render a story in viewMode=docs if \`@storybook/addon-docs\` is not installed`
      );

    const renderer = await docs.renderer();
    (renderer.render as DocsRenderFunction<TFramework>)(
      this.docsContext,
      docs,
      this.canvasElement,
      () => this.channel.emit(DOCS_RENDERED, this.id)
    );
    this.teardown = async ({ viewModeChanged }: { viewModeChanged?: boolean } = {}) => {
      if (!viewModeChanged || !this.canvasElement) return;
      renderer.unmount(this.canvasElement);
      this.torndown = true;
    };
  }
}
