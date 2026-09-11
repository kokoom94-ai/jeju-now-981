/* Artistic presentation pass, not additional geographic or photographic evidence. */
(function(root){
 const Base=root.JejuRender.WorldRenderer;
 class CityRenderer extends Base{
  makeMaterials(){
   super.makeMaterials();
   this.materials.ground.map=null;this.materials.ground.color.set('#bbc0b7');this.materials.ground.roughness=1;
   this.materials.roof.color.setRGB(1.7,1.75,1.7);
   for(let i=0;i<4;i++)this.materials['facade'+i].color.setRGB(1.1,1.12,1.1);
   this.materials.water.fragmentShader=this.materials.water.fragmentShader.replace('*.18+','*.022+').replace('*.09,1.','*.012,1.').replace('*.20+','*.028+').replace('*.06))','*.008))').replace('f*.75','f*.4');
  }
  setLighting(preset){
   super.setLighting(preset);this.hemisphere.groundColor.set('#bdc5b4');
   if(preset==='day'){this.hemisphere.intensity=3.0;this.sun.intensity=3.8;this.renderer.toneMappingExposure=1.3;}
   else if(preset==='golden'){this.hemisphere.intensity=2.0;this.sun.intensity=4.0;this.renderer.toneMappingExposure=1.28;}
   else{this.hemisphere.intensity=1.3;this.renderer.toneMappingExposure=1.0;}
  }
 }
 root.JejuRender.WorldRenderer=CityRenderer;
})(globalThis);
